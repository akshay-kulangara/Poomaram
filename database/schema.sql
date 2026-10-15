-- MySQL dump 10.13  Distrib 8.4.11, for Linux (x86_64)

--

-- Host: localhost    Database: taskdb

-- ------------------------------------------------------

-- Server version	8.4.11



/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;

/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;

/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;

/*!50503 SET NAMES utf8mb4 */;

/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;

/*!40103 SET TIME_ZONE='+00:00' */;

/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;

/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;

/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;

/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;



--

-- Table structure for table \`activities\`

--



DROP TABLE IF EXISTS \`activities\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`activities\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`type\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,

  \`message\` text COLLATE utf8mb4_unicode_ci NOT NULL,

  \`icon\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '',

  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (\`id\`)

) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Table structure for table \`assignments\`

--



DROP TABLE IF EXISTS \`assignments\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`assignments\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`task_id\` int NOT NULL,

  \`roommate_id\` int NOT NULL,

  \`status\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',

  \`assigned_date\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  \`completed_date\` timestamp NULL DEFAULT NULL,

  \`completion_photo\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

  \`completion_notes\` text COLLATE utf8mb4_unicode_ci,

  PRIMARY KEY (\`id\`),

  KEY \`task_id\` (\`task_id\`),

  KEY \`roommate_id\` (\`roommate_id\`),

  CONSTRAINT \`assignments_ibfk_1\` FOREIGN KEY (\`task_id\`) REFERENCES \`tasks\` (\`id\`) ON DELETE CASCADE,

  CONSTRAINT \`assignments_ibfk_2\` FOREIGN KEY (\`roommate_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Table structure for table \`expense_group_members\`

--



DROP TABLE IF EXISTS \`expense_group_members\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`expense_group_members\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`group_id\` int NOT NULL,

  \`user_id\` int NOT NULL,

  \`joined_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (\`id\`),

  UNIQUE KEY \`uniq_group_user\` (\`group_id\`,\`user_id\`),

  KEY \`user_id\` (\`user_id\`),

  CONSTRAINT \`expense_group_members_ibfk_1\` FOREIGN KEY (\`group_id\`) REFERENCES \`expense_groups\` (\`id\`) ON DELETE CASCADE,

  CONSTRAINT \`expense_group_members_ibfk_2\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Table structure for table \`expense_groups\`

--



DROP TABLE IF EXISTS \`expense_groups\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`expense_groups\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,

  \`description\` text COLLATE utf8mb4_unicode_ci,

  \`created_by\` int NOT NULL,

  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  \`is_settled\` tinyint(1) NOT NULL DEFAULT '0',

  PRIMARY KEY (\`id\`),

  KEY \`created_by\` (\`created_by\`),

  CONSTRAINT \`expense_groups_ibfk_1\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Table structure for table \`expense_splits\`

--



DROP TABLE IF EXISTS \`expense_splits\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`expense_splits\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`expense_id\` int NOT NULL,

  \`user_id\` int NOT NULL,

  \`share_amount\` decimal(12,2) NOT NULL,

  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (\`id\`),

  KEY \`expense_id\` (\`expense_id\`),

  KEY \`user_id\` (\`user_id\`),

  CONSTRAINT \`expense_splits_ibfk_1\` FOREIGN KEY (\`expense_id\`) REFERENCES \`expenses\` (\`id\`) ON DELETE CASCADE,

  CONSTRAINT \`expense_splits_ibfk_2\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Table structure for table \`expenses\`

--



DROP TABLE IF EXISTS \`expenses\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`expenses\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`group_id\` int NOT NULL,

  \`description\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,

  \`amount\` decimal(12,2) NOT NULL,

  \`paid_by\` int NOT NULL,

  \`category\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',

  \`expense_date\` date NOT NULL,

  \`receipt_photo\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

  \`notes\` text COLLATE utf8mb4_unicode_ci,

  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (\`id\`),

  KEY \`group_id\` (\`group_id\`),

  KEY \`paid_by\` (\`paid_by\`),

  CONSTRAINT \`expenses_ibfk_1\` FOREIGN KEY (\`group_id\`) REFERENCES \`expense_groups\` (\`id\`) ON DELETE CASCADE,

  CONSTRAINT \`expenses_ibfk_2\` FOREIGN KEY (\`paid_by\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Table structure for table \`roommates\`

--



DROP TABLE IF EXISTS \`roommates\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`roommates\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,

  \`photo\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

  \`user_id\` int DEFAULT NULL,

  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (\`id\`),

  KEY \`user_id\` (\`user_id\`),

  CONSTRAINT \`roommates_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL

) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Table structure for table \`settlements\`

--



DROP TABLE IF EXISTS \`settlements\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`settlements\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`group_id\` int NOT NULL,

  \`from_user_id\` int NOT NULL,

  \`to_user_id\` int NOT NULL,

  \`amount\` decimal(12,2) NOT NULL,

  \`notes\` text COLLATE utf8mb4_unicode_ci,

  \`settlement_date\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (\`id\`),

  KEY \`group_id\` (\`group_id\`),

  KEY \`from_user_id\` (\`from_user_id\`),

  KEY \`to_user_id\` (\`to_user_id\`),

  CONSTRAINT \`settlements_ibfk_1\` FOREIGN KEY (\`group_id\`) REFERENCES \`expense_groups\` (\`id\`) ON DELETE CASCADE,

  CONSTRAINT \`settlements_ibfk_2\` FOREIGN KEY (\`from_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,

  CONSTRAINT \`settlements_ibfk_3\` FOREIGN KEY (\`to_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Table structure for table \`tasks\`

--



DROP TABLE IF EXISTS \`tasks\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`tasks\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,

  \`frequency\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'one-time',

  \`duration\` int DEFAULT NULL,

  \`status\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',

  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (\`id\`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Table structure for table \`users\`

--



DROP TABLE IF EXISTS \`users\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`users\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`username\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,

  \`email\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,

  \`password_hash\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,

  \`full_name\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

  \`photo\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

  \`is_active\` tinyint(1) NOT NULL DEFAULT '1',

  \`role\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',

  \`last_login\` timestamp NULL DEFAULT NULL,

  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (\`id\`),

  UNIQUE KEY \`username\` (\`username\`),

  UNIQUE KEY \`email\` (\`email\`)

) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Table structure for table \`waste_bin_entries\`

--



DROP TABLE IF EXISTS \`waste_bin_entries\`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE \`waste_bin_entries\` (

  \`id\` int NOT NULL AUTO_INCREMENT,

  \`roommate_id\` int NOT NULL,

  \`dumped_date\` date NOT NULL,

  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (\`id\`),

  UNIQUE KEY \`uniq_roommate_date\` (\`roommate_id\`,\`dumped_date\`),

  CONSTRAINT \`waste_bin_entries_ibfk_1\` FOREIGN KEY (\`roommate_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET character_set_client = @saved_cs_client */;



--

-- Dumping routines for database 'taskdb'

--

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;



/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;

/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;

/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;

/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;

/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;



-- Dump completed on 2026-10-09 13:16:30
