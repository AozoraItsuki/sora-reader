import { open } from '@op-engineering/op-sqlite';
import { Logger } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/op-sqlite';
import { migrate } from 'drizzle-orm/op-sqlite/migrator';
import { useEffect, useReducer } from 'react';

import migrations from '../../drizzle/migrations';
import { createDbManager } from './manager/manager';
import {
  createCategoryDefaultQuery,
  createDefaultRepositoryQuery,
} from './queryStrings/populate';
import {
  createCategoryTriggerQuery,
  createNovelTriggerQueryDelete,
  createNovelTriggerQueryInsert,
  createNovelTriggerQueryUpdate,
  dropCategoryTriggerQuery,
  dropNovelTriggerQueryDelete,
  dropNovelTriggerQueryInsert,
  dropNovelTriggerQueryUpdate,
} from './queryStrings/triggers';
import { schema } from './schema';

class MyLogger implements Logger {
  logQuery(_query: string, _params: unknown[]): void {
    // console.trace('DB Query: ', { query, params });
  }
}

const DB_NAME = 'lnreader.db';
const _db = open({ name: DB_NAME, location: '../files/SQLite' });

/**
 * Raw SQLite database instance
 * @deprecated Use `drizzleDb` for new code
 */
export const db = _db;

/**
 * Drizzle ORM database instance with type-safe query builder
 * Use this for all new database operations
 */
export const drizzleDb = drizzle(_db, {
  schema,
  logger: __DEV__ ? new MyLogger() : false,
});

export const dbManager = createDbManager(drizzleDb);

type SqlExecutor = {
  executeSync: (
    sql: string,
    params?: Parameters<typeof _db.executeSync>[1],
  ) => void;
};

const setPragmas = (executor: SqlExecutor) => {
  console.log('Setting database Pragmas');
  const queries = [
    'PRAGMA journal_mode = WAL',
    'PRAGMA synchronous = NORMAL',
    'PRAGMA temp_store = MEMORY',
    'PRAGMA busy_timeout = 5000',
    'PRAGMA cache_size = 10000',
    'PRAGMA foreign_keys = ON',
  ];
  queries.forEach(query => executor.executeSync(query));
};
const populateDatabase = (executor: SqlExecutor) => {
  console.log('Populating database');
  executor.executeSync(createCategoryDefaultQuery);
  executor.executeSync(createDefaultRepositoryQuery);
};

export const runDatabaseBootstrap = (executor: SqlExecutor) => {
  createDbTriggers(executor);
  populateDatabase(executor);
};

const createDbTriggers = (executor: SqlExecutor) => {
  console.log('Creating database triggers');
  // --- drop ---
  executor.executeSync(dropNovelTriggerQueryInsert);
  executor.executeSync(dropNovelTriggerQueryUpdate);
  executor.executeSync(dropNovelTriggerQueryDelete);
  executor.executeSync(dropCategoryTriggerQuery);
  // --- create ---
  executor.executeSync(createNovelTriggerQueryInsert);
  executor.executeSync(createNovelTriggerQueryUpdate);
  executor.executeSync(createNovelTriggerQueryDelete);
  executor.executeSync(createCategoryTriggerQuery);
};

type InitDbState = {
  success?: boolean;
  error?: Error;
};
const initialState = {
  success: false,
  error: undefined,
};
const fetchReducer = (
  state$1: InitDbState,
  action:
    | {
        type: 'migrating' | 'migrated';
        payload?: boolean | undefined;
      }
    | {
        type: 'error';
        payload: Error;
      },
) => {
  switch (action.type) {
    case 'migrating':
      return { ...initialState };
    case 'migrated':
      return {
        ...initialState,
        success: action.payload,
      };
    case 'error':
      return {
        ...initialState,
        error: action.payload,
      };
    default:
      return state$1;
  }
};

export const useInitDatabase = () => {
  const [state, dispatch] = useReducer(fetchReducer, initialState);
  useEffect(() => {
    dispatch({ type: 'migrating' });
    setPragmas(_db);

    // To resolve issue in drizzle before beta 16
    const results = db.executeRawSync(
      `PRAGMA table_info(__drizzle_migrations);`,
    );
    const resolved = results.some((row: unknown[]) => row[1] === 'applied_at');
    if (!resolved && results.length > 0) {
      _db.executeRawSync(
        "ALTER TABLE '__drizzle_migrations' ADD COLUMN 'applied_at' text;",
      );
      _db.executeRawSync(
        "ALTER TABLE '__drizzle_migrations' ADD COLUMN 'name' text;",
      );
    }

    // Pre-flight: if charOffset column already exists, ensure the migration is
    // marked as applied so Drizzle won't try to run it again (which would fail
    // with "duplicate column"). We create the migrations table ourselves if it
    // doesn't exist yet, so the INSERT always succeeds.
    try {
      const chapterInfo = db.executeRawSync(`PRAGMA table_info(Chapter);`);
      const charOffsetExists = chapterInfo.some(
        (row: unknown[]) => row[1] === 'charOffset',
      );
      if (charOffsetExists) {
        // Ensure the migrations tracking table exists before we try to INSERT
        _db.executeSync(`
          CREATE TABLE IF NOT EXISTS __drizzle_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL UNIQUE,
            created_at NUMERIC,
            applied_at TEXT,
            name TEXT
          );
        `);
        const migKey = '20260620000000_char_offset';
        // Use executeRawSync without params to avoid potential param-binding issues
        const allTracked = db.executeRawSync(
          `SELECT hash FROM __drizzle_migrations`,
        );
        const isTracked =
          allTracked &&
          allTracked.some((row: unknown[]) => row[0] === migKey);
        if (!isTracked) {
          _db.executeSync(
            `INSERT OR IGNORE INTO __drizzle_migrations (hash, applied_at) VALUES ('${migKey}', '${Date.now()}')`,
          );
        }
      }
    } catch (preFlightErr) {
      console.warn('Pre-flight charOffset check failed:', preFlightErr);
    }

    migrate(drizzleDb, migrations)
      .then(() => {
        // Fix database migrations
        const queryChapter = db.executeRawSync(`PRAGMA table_info(Chapter);`);
        const readDurationCheck = queryChapter.some(
          (row: unknown[]) => row[1] === 'readDuration',
        );
        const dateFetchCheck = queryChapter.some(
          (row: unknown[]) => row[1] === 'dateFetch',
        );
        if (dateFetchCheck) {
          db.executeRawSync('ALTER TABLE Chapter DROP COLUMN dateFetch;');
        }
        if (readDurationCheck) {
          // 1. Migrate existing readDuration data to a new table
          db.executeRawSync(`
            INSERT OR IGNORE INTO LNReader_eXtended_Chapter_History (chapterId, readDuration)
            SELECT id, readDuration 
            FROM Chapter 
            WHERE readDuration IS NOT NULL AND readDuration > 0;
          `);
          // 2. Drop the readDuration column from Chapter table
          db.executeRawSync('ALTER TABLE Chapter DROP COLUMN readDuration;');
        }
        // Add charOffset column if still missing (safety net)
        const charOffsetCheck = queryChapter.some(
          (row: unknown[]) => row[1] === 'charOffset',
        );
        if (!charOffsetCheck) {
          db.executeRawSync(
            'ALTER TABLE Chapter ADD COLUMN charOffset integer DEFAULT 0;',
          );
        }
        runDatabaseBootstrap(_db);
        dispatch({
          type: 'migrated',
          payload: true,
        });
      })
      .catch((error: Error) => {
        // If the migration failed because charOffset already exists (duplicate
        // column), treat it as a successful migration to prevent the error
        // screen from showing on every reopen.
        const msg = error?.message ?? '';
        if (
          msg.includes('charOffset') ||
          msg.toLowerCase().includes('duplicate column') ||
          msg.toLowerCase().includes('already exists')
        ) {
          // Mark the migration as applied so it won't be retried next time
          try {
            _db.executeSync(`
              CREATE TABLE IF NOT EXISTS __drizzle_migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hash TEXT NOT NULL UNIQUE,
                created_at NUMERIC,
                applied_at TEXT,
                name TEXT
              );
            `);
            const migKey = '20260620000000_char_offset';
            _db.executeSync(
              `INSERT OR IGNORE INTO __drizzle_migrations (hash, applied_at) VALUES ('${migKey}', '${Date.now()}')`,
            );
          } catch (trackErr) {
            console.warn('Failed to mark migration as applied:', trackErr);
          }
          runDatabaseBootstrap(_db);
          dispatch({ type: 'migrated', payload: true });
        } else {
          dispatch({
            type: 'error',
            payload: error,
          });
        }
      });
  }, []);
  return state;
};
