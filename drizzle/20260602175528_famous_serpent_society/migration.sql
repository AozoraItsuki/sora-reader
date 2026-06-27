CREATE TABLE IF NOT EXISTS `SoraReader_eXtended_Chapter_History` (
	`chapterId` integer PRIMARY KEY,
	`readDuration` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_SoraReader_eXtended_Chapter_History_chapterId_Chapter_id_fk` FOREIGN KEY (`chapterId`) REFERENCES `Chapter`(`id`) ON DELETE CASCADE
);
