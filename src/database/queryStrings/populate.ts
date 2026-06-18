import { getString } from '@strings/translations';

const escapeSqlString = (value: string) => value.replace(/'/g, "''");

// if category with id = 2 exists, nothing in db.ts file is executed
export const createCategoryDefaultQuery = `
INSERT OR IGNORE INTO Category (id, name, sort) VALUES 
  (1, '${escapeSqlString(getString('categories.default'))}', 1),
  (2, '${escapeSqlString(getString('categories.local'))}', 2)
`;

export const createDefaultRepositoryQuery = `
INSERT OR IGNORE INTO Repository (url) VALUES
  ('https://raw.githubusercontent.com/Yuneko-dev/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json')
`;
