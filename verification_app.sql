-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 02, 2026 at 05:49 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `verification_app`
--

DELIMITER $$
--
-- Functions
--
CREATE DEFINER=`root`@`localhost` FUNCTION `dverif_normalize_phone` (`p_phone` VARCHAR(30), `p_deleted_at` DATETIME) RETURNS VARCHAR(20) CHARSET utf8mb4 COLLATE utf8mb4_general_ci DETERMINISTIC BEGIN
  DECLARE v_digits VARCHAR(30);

  IF p_phone IS NULL OR p_deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SET v_digits = REGEXP_REPLACE(p_phone, '[^0-9]', '');

  IF v_digits = '' THEN
    RETURN NULL;
  END IF;

  IF CHAR_LENGTH(v_digits) = 14 AND v_digits LIKE '0092%' THEN
    SET v_digits = SUBSTRING(v_digits, 5);
  ELSEIF CHAR_LENGTH(v_digits) = 12 AND v_digits LIKE '92%' THEN
    SET v_digits = SUBSTRING(v_digits, 3);
  ELSEIF CHAR_LENGTH(v_digits) = 11 AND v_digits LIKE '0%' THEN
    SET v_digits = SUBSTRING(v_digits, 2);
  END IF;

  RETURN v_digits;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `access_requests`
--

CREATE TABLE `access_requests` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL DEFAULT uuid(),
  `organization_name` varchar(255) NOT NULL,
  `contact_name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `company_size` varchar(100) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `status` enum('new','contacted','onboarded','rejected') NOT NULL DEFAULT 'new',
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `admin_password_reset_tokens`
--

CREATE TABLE `admin_password_reset_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `admin_uuid` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL COMMENT 'SHA-256 hex of the raw token sent to admin',
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `admin_profiles`
--

CREATE TABLE `admin_profiles` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password` varchar(255) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `profile_image` varchar(500) DEFAULT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `preferred_language` enum('en','ur') NOT NULL DEFAULT 'en',
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `admin_profiles`
--

INSERT INTO `admin_profiles` (`id`, `uuid`, `email`, `password`, `full_name`, `phone`, `profile_image`, `status`, `preferred_language`, `created_at`) VALUES
(2, 'b16014ca-9bc5-11f1-a28a-9840bb468dc0', 'admin@dverif.com', '$2a$12$4jp0R5z0bWJB9XpZEIeDNecxVZ5MFqM1FpkFyVzHtkC8EWorRObBu', 'Platform Admin', '', 'uploads/profiles/profile_1790612185467.png', 'active', 'en', '2026-08-19 17:01:21');

--
-- Triggers `admin_profiles`
--
DELIMITER $$
CREATE TRIGGER `bi_admin_profiles_uuid` BEFORE INSERT ON `admin_profiles` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `approval_requests`
--

CREATE TABLE `approval_requests` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `workflow_id` bigint(20) UNSIGNED NOT NULL,
  `module_key` varchar(60) NOT NULL,
  `entity_type` varchar(60) NOT NULL,
  `entity_uuid` char(36) NOT NULL,
  `current_step_order` smallint(5) UNSIGNED DEFAULT NULL,
  `status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `title` varchar(200) DEFAULT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `requested_by_uuid` char(36) NOT NULL,
  `requested_at` datetime NOT NULL DEFAULT current_timestamp(),
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by_uuid` char(36) DEFAULT NULL,
  `outcome_notes` text DEFAULT NULL,
  `live_entity_uuid` char(36) GENERATED ALWAYS AS (case when `status` = 'pending' then `entity_uuid` else NULL end) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `approval_requests`
--
DELIMITER $$
CREATE TRIGGER `bi_approval_requests_uuid` BEFORE INSERT ON `approval_requests` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `approval_step_history`
--

CREATE TABLE `approval_step_history` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `approval_request_uuid` char(36) NOT NULL,
  `step_id` bigint(20) UNSIGNED DEFAULT NULL,
  `step_order` smallint(5) UNSIGNED NOT NULL,
  `step_name` varchar(120) NOT NULL,
  `approver_uuid` char(36) DEFAULT NULL,
  `approver_name` varchar(150) DEFAULT NULL,
  `decision` enum('pending','approved','rejected','skipped','cancelled','forwarded') NOT NULL,
  `comments` text DEFAULT NULL,
  `acted_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `approval_step_history`
--
DELIMITER $$
CREATE TRIGGER `bi_approval_step_history_uuid` BEFORE INSERT ON `approval_step_history` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `assets`
--

CREATE TABLE `assets` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `asset_tag` varchar(40) NOT NULL,
  `name` varchar(200) NOT NULL,
  `model_details` varchar(200) DEFAULT NULL,
  `serial_number` varchar(120) DEFAULT NULL,
  `purchase_date` date DEFAULT NULL,
  `purchase_cost` decimal(12,2) DEFAULT NULL,
  `vendor` varchar(200) DEFAULT NULL,
  `warranty_expires_at` date DEFAULT NULL,
  `status` enum('available','assigned','maintenance','retired') NOT NULL DEFAULT 'available',
  `notes` text DEFAULT NULL,
  `created_by_uuid` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `active_assignment_guard` char(36) GENERATED ALWAYS AS (case when `status` = 'assigned' then `uuid` else NULL end) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `assets`
--

INSERT INTO `assets` (`id`, `uuid`, `organization_id`, `asset_tag`, `name`, `model_details`, `serial_number`, `purchase_date`, `purchase_cost`, `vendor`, `warranty_expires_at`, `status`, `notes`, `created_by_uuid`, `created_at`, `updated_at`) VALUES
(28, '3365fc53-d50e-11f1-80de-9840bb468dc0', 1, 'AST-0001', 'Testing', NULL, NULL, '2026-10-31', 20000.00, 'testing vendor', '2026-11-04', 'assigned', NULL, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 14:33:59', '2026-11-02 18:14:31');

--
-- Triggers `assets`
--
DELIMITER $$
CREATE TRIGGER `bi_assets_uuid` BEFORE INSERT ON `assets` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `asset_assignments`
--

CREATE TABLE `asset_assignments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `asset_uuid` char(36) NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `assigned_by_uuid` char(36) DEFAULT NULL,
  `assigned_at` datetime NOT NULL DEFAULT current_timestamp(),
  `returned_at` datetime DEFAULT NULL,
  `returned_to_uuid` char(36) DEFAULT NULL,
  `return_condition` enum('good','damaged','needs_maintenance') DEFAULT NULL,
  `return_notes` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `open_assignment_guard` tinyint(4) GENERATED ALWAYS AS (case when `returned_at` is null then 1 else NULL end) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `asset_assignments`
--

INSERT INTO `asset_assignments` (`id`, `uuid`, `organization_id`, `asset_uuid`, `employee_uuid`, `assigned_by_uuid`, `assigned_at`, `returned_at`, `returned_to_uuid`, `return_condition`, `return_notes`, `created_at`) VALUES
(23, '4f86a43c-d50e-11f1-80de-9840bb468dc0', 1, '3365fc53-d50e-11f1-80de-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 14:34:46', '2026-11-01 19:18:20', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'good', NULL, '2026-10-31 14:34:46'),
(74, '584377d0-d6bf-11f1-9a5e-9840bb468dc0', 1, '3365fc53-d50e-11f1-80de-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-02 18:14:31', NULL, NULL, NULL, NULL, '2026-11-02 18:14:31');

--
-- Triggers `asset_assignments`
--
DELIMITER $$
CREATE TRIGGER `bi_asset_assignments_uuid` BEFORE INSERT ON `asset_assignments` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `asset_maintenance`
--

CREATE TABLE `asset_maintenance` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `asset_uuid` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `status` enum('open','completed','cancelled') NOT NULL DEFAULT 'open',
  `vendor` varchar(200) DEFAULT NULL,
  `cost` decimal(12,2) DEFAULT NULL,
  `reported_by_uuid` char(36) DEFAULT NULL,
  `reported_at` datetime NOT NULL DEFAULT current_timestamp(),
  `completed_at` datetime DEFAULT NULL,
  `completed_by_uuid` char(36) DEFAULT NULL,
  `completion_notes` text DEFAULT NULL,
  `open_job_guard` tinyint(4) GENERATED ALWAYS AS (case when `status` = 'open' then 1 else NULL end) STORED,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `asset_maintenance`
--
DELIMITER $$
CREATE TRIGGER `bi_asset_maintenance_uuid` BEFORE INSERT ON `asset_maintenance` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `attachments`
--

CREATE TABLE `attachments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `entity_type` varchar(60) NOT NULL,
  `entity_uuid` char(36) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `mime_type` varchar(120) DEFAULT NULL,
  `file_size` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `category` varchar(40) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `uploaded_by_uuid` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `deleted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `attachments`
--

INSERT INTO `attachments` (`id`, `uuid`, `organization_id`, `entity_type`, `entity_uuid`, `file_name`, `file_path`, `mime_type`, `file_size`, `category`, `description`, `uploaded_by_uuid`, `created_at`, `deleted_at`) VALUES
(1, '7dca5382-6c58-4008-ae65-b0e6f4d29434', 1, 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', 'Hunain_Haider_CV.pdf', 'att_1793374573333_324310174.pdf', 'application/pdf', 75951, 'candidate_resume', NULL, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 20:36:13', NULL),
(2, '7da3b218-d020-4ee8-84c0-d5f61b29cf2c', 1, 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', 'M_Junaid_Shahid_CV.pdf', 'att_1793381672036_323028326.pdf', 'application/pdf', 501512, 'candidate_resume', NULL, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 22:34:32', NULL),
(3, 'c866ee50-ac43-4da6-9b3d-56193be1cb57', 3, 'candidate', 'ebe376c8-ffdd-4437-a24d-52cf0b41c565', 'Arbaz_Ali_CV.pdf', 'att_1793382941092_56150412.pdf', 'application/pdf', 502098, 'candidate_resume', NULL, 'c344496e-d489-11f1-942b-9840bb468dc0', '2026-10-30 22:55:41', NULL),
(14, '5f7c7a48-806d-4a07-962e-6a244defd286', 1, 'expense_claim', '4db27dd6-d8fa-468e-b2b4-6b45d9219edf', 'WhatsApp Image 2026-11-01 at 5.39.51 PM.jpeg', 'att_1793541004978_185552960.jpeg', 'image/jpeg', 149404, 'expense_receipt', NULL, '1f228ba4-d46c-11f1-942b-9840bb468dc0', '2026-11-01 18:50:05', NULL);

--
-- Triggers `attachments`
--
DELIMITER $$
CREATE TRIGGER `bi_attachments_uuid` BEFORE INSERT ON `attachments` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `attendance_records`
--

CREATE TABLE `attendance_records` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `check_in_at` datetime DEFAULT NULL,
  `check_out_at` datetime DEFAULT NULL,
  `check_in_ip` varchar(45) DEFAULT NULL,
  `check_out_ip` varchar(45) DEFAULT NULL,
  `date` date NOT NULL,
  `status` enum('checked_in','checked_out') NOT NULL DEFAULT 'checked_in',
  `is_manual` enum('yes','no') NOT NULL DEFAULT 'no',
  `manual_reason` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `attendance_records`
--

INSERT INTO `attendance_records` (`id`, `uuid`, `employee_uuid`, `organization_id`, `check_in_at`, `check_out_at`, `check_in_ip`, `check_out_ip`, `date`, `status`, `is_manual`, `manual_reason`, `created_at`) VALUES
(1, '0322866e-d46e-11f1-942b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 1, '2026-10-30 09:00:00', '2026-10-30 17:00:00', '::1', NULL, '2026-10-30', 'checked_out', 'yes', 'Dummy attendance for payroll testing', '2026-10-30 19:27:19'),
(2203, '4ba8733a-d5f1-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 1, '2026-11-01 17:39:35', '2026-11-01 18:16:40', '::1', '::1', '2026-11-01', 'checked_out', 'no', NULL, '2026-11-01 17:39:35'),
(2220, '39a6e191-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 1, '2026-10-23 09:00:00', '2026-10-23 17:00:00', NULL, NULL, '2026-10-23', 'checked_out', 'yes', 'Dummy attendance for payroll testing', '2026-11-01 18:36:21'),
(2221, '39a6f89d-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 1, '2026-10-26 09:00:00', '2026-10-26 17:00:00', NULL, NULL, '2026-10-26', 'checked_out', 'yes', 'Dummy attendance for payroll testing', '2026-11-01 18:36:21'),
(2222, '39a70e88-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 1, '2026-10-27 09:00:00', '2026-10-27 17:00:00', NULL, NULL, '2026-10-27', 'checked_out', 'yes', 'Dummy attendance for payroll testing', '2026-11-01 18:36:21'),
(2223, '39a72629-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 1, '2026-10-28 09:00:00', '2026-10-28 17:00:00', NULL, NULL, '2026-10-28', 'checked_out', 'yes', 'Dummy attendance for payroll testing', '2026-11-01 18:36:21'),
(2224, '39a73cf1-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 1, '2026-10-29 09:00:00', '2026-10-29 17:00:00', NULL, NULL, '2026-10-29', 'checked_out', 'yes', 'Dummy attendance for payroll testing', '2026-11-01 18:36:21'),
(2226, '71a42e84-3591-4372-8c40-62e6ec97dade', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-01 09:00:00', '2026-10-01 17:00:00', NULL, NULL, '2026-10-01', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2227, 'd71e1be7-185d-4a53-b554-ae6490ffdbad', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-02 09:00:00', '2026-10-02 17:00:00', NULL, NULL, '2026-10-02', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2228, '27823024-becb-41b7-b81d-1841200d2740', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-05 09:00:00', '2026-10-05 17:00:00', NULL, NULL, '2026-10-05', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2229, '9a1e95a0-1edf-4913-95a9-b40dbb4fdaa1', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-06 09:00:00', '2026-10-06 17:00:00', NULL, NULL, '2026-10-06', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2230, '80677592-c1e8-4325-90f3-bd86881f95d3', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-07 09:00:00', '2026-10-07 17:00:00', NULL, NULL, '2026-10-07', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2231, '33a66d33-ad16-405d-b550-69db01e03103', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-08 09:00:00', '2026-10-08 17:00:00', NULL, NULL, '2026-10-08', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2232, '11c19799-ded6-45e7-be48-721d88a8a533', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-09 09:00:00', '2026-10-09 17:00:00', NULL, NULL, '2026-10-09', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2233, 'c5761c7a-1088-4341-82f3-f940b3d0c9f1', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-12 09:00:00', '2026-10-12 17:00:00', NULL, NULL, '2026-10-12', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2234, '468c2476-2155-4305-80f4-fbeee27bb8d6', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-13 09:00:00', '2026-10-13 17:00:00', NULL, NULL, '2026-10-13', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2235, '8866716a-ac4e-48a9-83bd-1cb9118af865', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-14 09:00:00', '2026-10-14 17:00:00', NULL, NULL, '2026-10-14', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2236, 'c384be48-2d91-4f92-91ec-06dedc829024', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-15 09:00:00', '2026-10-15 17:00:00', NULL, NULL, '2026-10-15', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2237, 'b1cb16b4-a019-43a4-b05c-5eddacec6e2b', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-16 09:00:00', '2026-10-16 17:00:00', NULL, NULL, '2026-10-16', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2238, '6143ba12-c703-47e6-a7df-6e9dbc465828', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-19 09:00:00', '2026-10-19 17:00:00', NULL, NULL, '2026-10-19', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2239, '74ac9a6b-5a41-447f-85f5-3c0c9b6f2bcf', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-20 09:00:00', '2026-10-20 17:00:00', NULL, NULL, '2026-10-20', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2240, '8f9f4c21-8500-4739-940d-5fa2f8c9c3e1', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-21 09:00:00', '2026-10-21 17:00:00', NULL, NULL, '2026-10-21', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2241, '1ffe7bad-aaef-4841-a178-2131d3699c59', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-22 09:00:00', '2026-10-22 17:00:00', NULL, NULL, '2026-10-22', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2242, 'b670a9e9-0acb-4dff-914c-6fb84506c635', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-23 09:00:00', '2026-10-23 17:00:00', NULL, NULL, '2026-10-23', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2243, 'cbcd0589-2073-491a-a819-38cefb992a5c', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-26 09:00:00', '2026-10-26 17:00:00', NULL, NULL, '2026-10-26', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2244, '2b953aa1-6343-4e72-8126-0ebaebd95edb', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-27 09:00:00', '2026-10-27 17:00:00', NULL, NULL, '2026-10-27', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2245, 'f0647f4a-13f5-44a8-b8e6-5f92e25eb477', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-28 09:00:00', '2026-10-28 17:00:00', NULL, NULL, '2026-10-28', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2246, 'd3f04709-e393-4d76-b2b9-c36c8c6f66ca', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-29 09:00:00', '2026-10-29 17:00:00', NULL, NULL, '2026-10-29', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11'),
(2247, 'e7039ca2-e1c2-41df-9b0f-4dc932dee497', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, '2026-10-30 09:00:00', '2026-10-30 17:00:00', NULL, NULL, '2026-10-30', 'checked_out', 'yes', 'Testing karna ha payroll', '2026-11-02 20:11:11');

--
-- Triggers `attendance_records`
--
DELIMITER $$
CREATE TRIGGER `bi_attendance_records_uuid` BEFORE INSERT ON `attendance_records` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL,
  `actor_type` enum('admin','user','system') NOT NULL COMMENT 'Who caused the change. system = automated (lifecycle sweep, gateway reconciliation, webhook) — no human actor',
  `actor_id` int(11) DEFAULT NULL COMMENT 'The admin/user id behind the change; NULL for system actions',
  `actor_name` varchar(190) DEFAULT NULL,
  `actor_role` varchar(32) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(100) NOT NULL,
  `entity_id` varchar(100) DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `audit_logs`
--

INSERT INTO `audit_logs` (`id`, `uuid`, `actor_type`, `actor_id`, `actor_name`, `actor_role`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `created_at`) VALUES
(1, 'c9798e92-32e7-43cb-aa38-03f3006b62e0', 'admin', 2, 'Platform Admin', 'system_admin', 'organization.create', 'organization', 'b16ef552-d462-11f1-942b-9840bb468dc0', '{\"name\":\"HakamTechSOl\",\"organization_type\":\"software_house\",\"initial_plan\":\"Free\",\"initial_plan_id\":1}', '::1', '2026-10-30 18:06:18'),
(2, '602844c5-1490-472d-bd52-34ece5fe2604', 'admin', 2, 'Platform Admin', 'system_admin', 'user.create', 'user', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '{\"email\":\"hunainhaider5566@gmail.com\",\"organization\":\"HakamTechSOl\"}', '::1', '2026-10-30 18:07:34'),
(3, '8f5ec99a-4bb4-4c3e-a979-361fc354e060', 'admin', 2, 'Platform Admin', 'system_admin', 'user.invite_resend', 'user', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '{\"email\":\"hunainhaider5566@gmail.com\"}', '::1', '2026-10-30 18:10:26'),
(4, 'd9adad15-50b8-475d-9cc5-b6c8b3d0f3fb', 'admin', 2, 'Platform Admin', 'system_admin', 'plans.update', 'subscription_plan', '283d94ac-b8f6-11f1-ac00-9840bb468dc0', '{\"name\":\"Free\",\"monthly_price\":\"0.00\",\"is_public\":1}', '::1', '2026-10-30 18:12:39'),
(5, 'c33afc0e-feb4-4cf9-a3cd-4ddff5438394', 'admin', 2, 'Platform Admin', 'system_admin', 'plans.update', 'subscription_plan', '283d94ac-b8f6-11f1-ac00-9840bb468dc0', '{\"name\":\"Free\",\"monthly_price\":\"0.00\",\"is_public\":1}', '::1', '2026-10-30 18:46:46'),
(6, '733427f1-294b-41b1-bc2e-24bd06a287b7', 'admin', 2, 'Platform Admin', 'system_admin', 'plans.update', 'subscription_plan', '7bd51ede-b8f6-11f1-ac00-9840bb468dc0', '{\"name\":\"Basic\",\"monthly_price\":\"10000.00\",\"is_public\":1}', '::1', '2026-10-30 18:48:06'),
(7, 'c3cab317-8baf-4b61-b9af-ab608e6b0007', 'admin', 2, 'Platform Admin', 'system_admin', 'plans.update', 'subscription_plan', 'aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0', '{\"name\":\"Professional\",\"monthly_price\":\"30000.00\",\"is_public\":1}', '::1', '2026-10-30 18:49:08'),
(8, '0f4a51f6-fbb9-43ee-bd8a-b0b6d56c6ca3', 'admin', 2, 'Platform Admin', 'system_admin', 'plans.update', 'subscription_plan', '7bd51ede-b8f6-11f1-ac00-9840bb468dc0', '{\"name\":\"Basic\",\"monthly_price\":\"10000.00\",\"is_public\":1}', '::1', '2026-10-30 18:49:25'),
(9, '0b724079-6962-447c-91c0-db804c253931', 'system', NULL, 'safepay_webhook', 'system', 'subscription.applied', 'organization', 'b16ef552-d462-11f1-942b-9840bb468dc0', '{\"source\":\"safepay_webhook\",\"transition\":\"upgrade_now\",\"relation\":\"upgrade\",\"before\":{\"status\":\"active\",\"plan_id\":1,\"expiry\":null},\"after\":{\"status\":\"active\",\"plan_id\":3,\"expiry\":\"2026-11-30T13:53:01.669Z\",\"pending_plan_id\":null},\"checkout_uuid\":\"f67bd6f0-d468-11f1-942b-9840bb468dc0\",\"gateway_event_id\":\"reconcile-track_bad52eb7-40bc-4623-a362-a431e66f5d25\",\"plan\":\"Professional\"}', 'unknown', '2026-10-30 18:53:01'),
(10, '68f932e0-0681-4135-846a-347dd6e643c3', 'admin', 2, 'Platform Admin', 'system_admin', 'organization.create', 'organization', '49a0d434-d46a-11f1-942b-9840bb468dc0', '{\"name\":\"HTS\",\"organization_type\":\"software_house\",\"initial_plan\":\"Free\",\"initial_plan_id\":1}', '::1', '2026-10-30 19:00:40'),
(11, 'a6c98d22-31d5-42e3-87d1-1eb25b5265b4', 'admin', 2, 'Platform Admin', 'system_admin', 'organization.delete', 'organization', '49a0d434-d46a-11f1-942b-9840bb468dc0', '{}', '::1', '2026-10-30 19:00:48'),
(12, 'e7c5e281-cd6e-493f-a9eb-4428c26c911a', 'admin', 2, 'Platform Admin', 'system_admin', 'user.create', 'user', '743b85c2-d46a-11f1-942b-9840bb468dc0', '{\"email\":\"hunainhaidre78822@gmail.com\",\"organization\":\"HTS\"}', '::1', '2026-10-30 19:02:39'),
(13, 'e67f17e5-f439-4b8d-937d-b3809c16f53d', 'admin', 2, 'Platform Admin', 'system_admin', 'user.invite_resend', 'user', '743b85c2-d46a-11f1-942b-9840bb468dc0', '{\"email\":\"hunainhaidre78822@gmail.com\"}', '::1', '2026-10-30 19:03:20'),
(14, 'c500f3bd-3d1a-45a3-8eff-d613952bf29d', 'user', 2, 'Hunain', 'org_admin', 'designation.create', 'designation', '6bc0e7b3-d46b-11f1-942b-9840bb468dc0', '{\"name\":\"Team Lead\"}', '::1', '2026-10-30 19:08:46'),
(15, 'f4eb131f-9a75-4236-987e-97a3845a80a9', 'user', 2, 'Hunain', 'org_admin', 'department.create', 'department', '70f2938b-d46b-11f1-942b-9840bb468dc0', '{\"name\":\"IT\"}', '::1', '2026-10-30 19:08:55'),
(16, 'dac58c6f-77f4-4bac-9e21-0739451548e5', 'admin', 2, 'Platform Admin', 'system_admin', 'document_type.create', 'document_type', '46', '{\"name\":\"CV/Resume\",\"schema_key\":\"generic\",\"is_active\":true}', '::1', '2026-10-30 19:10:10'),
(17, 'fd26a6ba-1f88-410f-aba1-a989f2d58eed', 'user', 1, 'Arbaz Ali ', 'org_admin', 'designation.create', 'designation', 'ffb2e9f1-d46b-11f1-942b-9840bb468dc0', '{\"name\":\"Manager\"}', '::1', '2026-10-30 19:12:55'),
(18, '3bbaca11-64a5-4b0e-b720-708484e4afea', 'user', 1, 'Arbaz Ali ', 'org_admin', 'department.create', 'department', '0901f05b-d46c-11f1-942b-9840bb468dc0', '{\"name\":\"IT\"}', '::1', '2026-10-30 19:13:10'),
(19, '4b312bb2-b96f-4a17-9d05-9e614d990111', 'user', 1, 'Arbaz Ali ', 'org_admin', 'employee.create', 'employee', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', '{\"full_name\":\"Hadi Ali\",\"email\":\"hunainhaider811@gmail.com\",\"organization_id\":1,\"created_platform_user\":true,\"linked_existing_account\":false,\"email_sent\":true}', '::1', '2026-10-30 19:14:24'),
(20, '9adce842-c67e-489b-8e47-b7053cd8cd9e', 'user', 1, 'Arbaz Ali ', 'org_admin', 'employee.document_upload', 'employee', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', '{\"count\":1}', '::1', '2026-10-30 19:14:30'),
(21, '90792bf6-e5b1-4f7d-8d25-1b4ba5e2d277', 'user', 1, 'Arbaz Ali ', 'org_admin', 'attendance.ip_add', 'organization', '1', '{\"ip\":\"36.255.32.248\"}', '::1', '2026-10-30 19:26:28'),
(22, '28abf871-a123-491b-9996-98add152c46b', 'user', 3, 'Hadi Ali', 'employee', 'attendance.check_in', 'attendance_record', '0322866e-d46e-11f1-942b-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-30 19:27:19'),
(23, 'f7fe7cd3-3c31-462b-94d9-8d5f1491359d', 'user', 1, 'Arbaz Ali ', 'org_admin', 'request.create', 'verification_request', '777530e2-d46f-11f1-942b-9840bb468dc0', '{\"document_type\":\"Experience Certificate\",\"status\":\"under_review\"}', '::1', '2026-10-30 19:37:44'),
(24, '9cf4abee-a12b-4fc5-b8a3-07c050990a6b', 'user', 2, 'Hunain', 'org_admin', 'request.verify', 'verification_request', '777530e2-d46f-11f1-942b-9840bb468dc0', '{\"status\":\"verified\",\"method\":\"portal\"}', '::1', '2026-10-30 19:38:47'),
(25, '26846e64-1223-4c16-affb-29b36f412fc1', 'system', NULL, 'Auto-Verify Matrix', NULL, 'request.auto_verify', 'verification_request', 'd717aed7-d46f-11f1-942b-9840bb468dc0', '{\"status\":\"verified\",\"method\":\"automatic_match\",\"confidence\":100}', 'unknown', '2026-10-30 19:40:43'),
(26, '760c9d22-3245-4844-8072-a948250437a1', 'user', 2, 'Hunain', 'org_admin', 'request.create', 'verification_request', 'd717aed7-d46f-11f1-942b-9840bb468dc0', '{\"document_type\":\"Experience Certificate\",\"status\":\"auto_verified\"}', '::1', '2026-10-30 19:40:43'),
(27, 'dc267319-8784-4b93-b8d0-5c60648fd9a0', 'system', NULL, 'safepay_webhook', 'system', 'subscription.applied', 'organization', '49a0d434-d46a-11f1-942b-9840bb468dc0', '{\"source\":\"safepay_webhook\",\"transition\":\"upgrade_now\",\"relation\":\"upgrade\",\"before\":{\"status\":\"active\",\"plan_id\":1,\"expiry\":null},\"after\":{\"status\":\"active\",\"plan_id\":3,\"expiry\":\"2026-11-30T14:42:32.414Z\",\"pending_plan_id\":null},\"checkout_uuid\":\"f6560a06-d46f-11f1-942b-9840bb468dc0\",\"gateway_event_id\":\"reconcile-track_5473a54c-8fb5-4599-ba23-0f7e7c45c15d\",\"plan\":\"Professional\"}', 'unknown', '2026-10-30 19:42:32'),
(28, '34c4885c-74ba-4ef1-9784-4b5226a02cc0', 'user', 1, 'Arbaz Ali ', 'org_admin', 'request.create', 'verification_request', '470f959c-d470-11f1-942b-9840bb468dc0', '{\"document_type\":\"Recommendation Letter\",\"status\":\"under_review\"}', '::1', '2026-10-30 19:43:32'),
(29, '13d97d4f-6a35-44e4-855b-29d229a952ab', 'user', 2, 'Hunain', 'org_admin', 'request.reject', 'verification_request', '470f959c-d470-11f1-942b-9840bb468dc0', '{\"status\":\"unverified\",\"method\":\"portal\"}', '::1', '2026-10-30 19:44:03'),
(30, 'a6244248-9c04-4dcd-9d75-dec464916949', 'user', 2, 'Hunain', 'org_admin', 'request.create', 'verification_request', '6beacefa-d470-11f1-942b-9840bb468dc0', '{\"document_type\":\"Recommendation Letter\",\"status\":\"under_review\"}', '::1', '2026-10-30 19:44:36'),
(31, '0ef4dc8a-64e3-4cde-87d3-0dcb45c86114', 'user', 1, 'Arbaz Ali ', 'org_admin', 'request.reject', 'verification_request', '6beacefa-d470-11f1-942b-9840bb468dc0', '{\"status\":\"unverified\",\"method\":\"portal\"}', '::1', '2026-10-30 19:45:08'),
(32, 'e9e07403-f4a8-49cf-94a1-161737cd7817', 'user', 1, 'Arbaz Ali ', 'org_admin', 'leave_type.create', 'leave_type', '1', '{\"organization_id\":1,\"name\":\"Sick\",\"days\":0}', '::1', '2026-10-30 19:46:16'),
(33, '8847fcf6-fba6-42ce-9a7c-20e0aa441014', 'user', 1, 'Arbaz Ali ', 'org_admin', 'leave_type.create', 'leave_type', '2', '{\"organization_id\":1,\"name\":\"Anuual\",\"days\":0}', '::1', '2026-10-30 19:46:40'),
(34, 'f5fef62b-f72f-4fd7-946d-951c11bad214', 'user', 1, 'Arbaz Ali ', 'org_admin', 'leave_allocation.set_designation', 'designation_leave_allocation', 'ffb2e9f1-d46b-11f1-942b-9840bb468dc0', '{\"designation_uuid\":\"ffb2e9f1-d46b-11f1-942b-9840bb468dc0\",\"designation\":\"Manager\",\"leave_type_id\":2,\"year\":2026,\"allocated_days\":20,\"employee_count\":1}', '::1', '2026-10-30 19:47:23'),
(35, '3e35377d-d7f9-4158-bf28-fddd838f559e', 'user', 1, 'Arbaz Ali ', 'org_admin', 'leave_allocation.set_designation', 'designation_leave_allocation', 'ffb2e9f1-d46b-11f1-942b-9840bb468dc0', '{\"designation_uuid\":\"ffb2e9f1-d46b-11f1-942b-9840bb468dc0\",\"designation\":\"Manager\",\"leave_type_id\":1,\"year\":2026,\"allocated_days\":20,\"employee_count\":1}', '::1', '2026-10-30 19:47:27'),
(36, '057c42ef-f1bb-4d52-b73d-78debfcc7e47', 'user', 3, 'Hadi Ali', 'employee', 'leave.create', 'leave_request', 'f531607a-d470-11f1-942b-9840bb468dc0', '{\"leave_type\":\"Anuual\",\"days\":7,\"start_date\":\"2026-10-31\",\"end_date\":\"2026-11-06\"}', '::1', '2026-10-30 19:48:25'),
(37, '2ce7cd4e-a97b-4165-bdb7-8c54433d02fc', 'user', 1, 'Arbaz Ali ', 'org_admin', 'leave.approve', 'leave_request', 'f531607a-d470-11f1-942b-9840bb468dc0', '{\"status\":\"approved\"}', '::1', '2026-10-30 19:50:00'),
(38, '43d60e0c-6803-4429-8dda-8924878f80f7', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.create', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"email_sent\":true}', '::1', '2026-10-30 20:05:33'),
(39, '3ff62cd8-f45f-4110-9f8c-8843de307633', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":false,\"approve_request\":false,\"hr_letters\":false,\"manage_assets\":false,\"manage_separation\":false,\"approve_expenses\":false,\"manage_recruitment\":false,\"override_failed_interview\":false}}', '::1', '2026-10-30 20:07:03'),
(40, '6b2ae818-91a8-416b-93aa-ca9bf39559fc', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":false,\"hr_letters\":false,\"manage_assets\":false,\"manage_separation\":false,\"approve_expenses\":false,\"manage_recruitment\":false,\"override_failed_interview\":false}}', '::1', '2026-10-30 20:07:32'),
(41, 'f0c2d73f-fc4a-4701-b51c-3a70941ad416', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":false,\"manage_assets\":false,\"manage_separation\":false,\"approve_expenses\":false,\"manage_recruitment\":false,\"override_failed_interview\":false}}', '::1', '2026-10-30 20:07:52'),
(42, 'ce384eb4-ff84-46c1-8605-8fc84ca4a97c', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":true,\"manage_assets\":false,\"manage_separation\":false,\"approve_expenses\":false,\"manage_recruitment\":false,\"override_failed_interview\":false}}', '::1', '2026-10-30 20:08:00'),
(43, '1b953d3e-182f-415b-9bf6-d8517d65c6a0', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":true,\"manage_assets\":true,\"manage_separation\":false,\"approve_expenses\":false,\"manage_recruitment\":false,\"override_failed_interview\":false}}', '::1', '2026-10-30 20:08:09'),
(44, '63cd2d86-0350-42c0-be85-ff9cc71939cb', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":true,\"manage_assets\":true,\"manage_separation\":false,\"approve_expenses\":false,\"manage_recruitment\":false,\"override_failed_interview\":true}}', '::1', '2026-10-30 20:08:26'),
(45, 'd23756a1-3e97-4643-80e1-1d4f1184882c', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":true,\"manage_assets\":true,\"manage_separation\":false,\"approve_expenses\":false,\"manage_recruitment\":true,\"override_failed_interview\":true}}', '::1', '2026-10-30 20:08:36'),
(46, '3f362625-5331-496a-b903-e59b05fab299', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":true,\"manage_assets\":true,\"manage_separation\":false,\"approve_expenses\":false,\"manage_recruitment\":true,\"override_failed_interview\":false}}', '::1', '2026-10-30 20:08:49'),
(47, 'd733b209-2d54-4236-a879-dddb85118b7d', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":true,\"manage_assets\":true,\"manage_separation\":true,\"approve_expenses\":false,\"manage_recruitment\":true,\"override_failed_interview\":false}}', '::1', '2026-10-30 20:09:03'),
(48, 'c78abbee-b6cc-4343-b16a-de44402d93d3', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":true,\"manage_assets\":true,\"manage_separation\":true,\"approve_expenses\":true,\"manage_recruitment\":true,\"override_failed_interview\":true}}', '::1', '2026-10-30 20:09:14'),
(49, '6148ed63-2231-4564-8bc4-08a662f31c7f', 'user', 1, 'Arbaz Ali ', 'org_admin', 'department.create', 'department', 'c220b13f-d475-11f1-942b-9840bb468dc0', '{\"name\":\"HR\"}', '::1', '2026-10-30 20:22:46'),
(50, '8b71d91b-6032-4c00-a9cd-06cc6841569c', 'user', 1, 'Arbaz Ali ', 'org_admin', 'employee.create', 'employee', 'fa4cd277-d475-11f1-942b-9840bb468dc0', '{\"full_name\":\"testing\",\"email\":\"testing1@gmail.com\",\"organization_id\":1,\"created_platform_user\":true,\"linked_existing_account\":false,\"email_sent\":true}', '::1', '2026-10-30 20:24:30'),
(51, 'ec01e6e4-fd61-4577-b091-ede15dbf045a', 'user', 3, 'Hadi Ali', 'employee', 'exit_request.submit_self', 'exit_request', '6e30afc7-4fce-40b2-806b-610f3e7c9c05', '{\"employee_uuid\":\"1ee2f46e-d46c-11f1-942b-9840bb468dc0\",\"last_working_day\":\"2026-12-04\"}', '::1', '2026-10-30 20:29:29'),
(52, '5764d2ee-b6ab-4b7b-895b-464296514414', 'user', 1, 'Arbaz Ali ', 'org_admin', 'exit_request.approved', 'exit_request', '6e30afc7-4fce-40b2-806b-610f3e7c9c05', '{\"last_working_day\":\"2026-12-04\",\"days_until_last_working_day\":35}', '::1', '2026-10-30 20:30:25'),
(53, '1d81193a-c7a9-48bb-8034-9a617e1eb9ce', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.policy.configure', 'payroll_policy', '1', '{\"currency\":\"PKR\",\"pay_frequency\":\"monthly\",\"daily_rate_basis\":\"fixed_30\",\"shift_start_time\":\"08:00\",\"hours_per_workday\":8,\"late_grace_minutes\":1,\"late_arrivals_per_penalty\":1,\"late_penalty_days\":1,\"overtime_multiplier\":1,\"deduct_unpaid_leave\":1,\"deduct_absences\":1,\"deduct_late_arrivals\":1,\"pay_approved_overtime\":1}', '::1', '2026-10-30 20:32:35'),
(54, 'd2115dcc-af4b-4cca-ac46-bea251af4bd8', 'user', 0, NULL, NULL, 'job_opening.create', 'job_opening', '81fe80d1-7e9b-4b3c-b393-b6ee148bd205', '{\"title\":\"Developer\",\"status\":\"open\",\"vacancies\":20}', 'unknown', '2026-10-30 20:35:28'),
(55, 'c4640ac5-45f6-4277-954b-211880db060f', 'user', 1, 'Arbaz Ali ', 'org_admin', 'job_opening.create', 'job_opening', '81fe80d1-7e9b-4b3c-b393-b6ee148bd205', '{\"title\":\"Developer\",\"status\":\"open\",\"vacancies\":20}', '::1', '2026-10-30 20:35:28'),
(56, '05c47e22-70dd-4229-b04f-1792c6f2d64f', 'user', 0, NULL, NULL, 'candidate.create', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"opening_uuid\":\"81fe80d1-7e9b-4b3c-b393-b6ee148bd205\",\"email\":\"hunainhaider811@gmail.com\"}', 'unknown', '2026-10-30 20:36:13'),
(57, '78aa88af-dfc5-4c10-a6f8-cf1c47d3b000', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.create', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"opening_uuid\":\"81fe80d1-7e9b-4b3c-b393-b6ee148bd205\",\"email\":\"hunainhaider811@gmail.com\"}', '::1', '2026-10-30 20:36:13'),
(58, 'b978b472-b853-4235-b7e6-42138b6e5fbc', 'user', 0, NULL, NULL, 'attachment.create', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"count\":1,\"category\":\"candidate_resume\"}', 'unknown', '2026-10-30 20:36:13'),
(59, '59ca9ebc-1321-4ce8-84b8-d5dedaab006d', 'user', 0, NULL, NULL, 'candidate.resume.attach', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"count\":1}', 'unknown', '2026-10-30 20:36:13'),
(60, '551417b1-4e4c-4fef-8107-21dfaebf094b', 'user', 0, NULL, NULL, 'candidate.stage.screening', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"from\":\"applied\",\"to\":\"screening\"}', 'unknown', '2026-10-30 20:36:18'),
(61, 'f220229c-7610-4ae5-a1af-19698cb11d75', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.screening', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"stage\":\"screening\"}', '::1', '2026-10-30 20:36:18'),
(62, '6e242ae9-ce03-4a4a-9a89-6c2d53842d05', 'user', 0, NULL, NULL, 'candidate.stage.interview', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"from\":\"screening\",\"to\":\"interview\"}', 'unknown', '2026-10-30 20:36:28'),
(63, 'a2fba441-75a8-4510-a95e-960d209bc013', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.interview', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"stage\":\"interview\"}', '::1', '2026-10-30 20:36:28'),
(64, '0b7f277c-cb18-4a1a-bbe1-54db9976c7fe', 'user', 352, NULL, NULL, 'interview.schedule', 'interview', '924dac4b-6d78-412a-b236-134eeba41dc2', '{\"candidate_uuid\":\"619c5d63-123d-4800-9365-bafa4086a178\",\"scheduled_at\":\"2026-10-07T15:41:00.000Z\"}', 'unknown', '2026-10-30 20:41:59'),
(65, '9a14fb1c-a93f-4e00-9155-bf0cabc042c0', 'user', 4, 'Tooba', 'sub_admin', 'interview.schedule', 'interview', '924dac4b-6d78-412a-b236-134eeba41dc2', '{\"candidate_uuid\":\"619c5d63-123d-4800-9365-bafa4086a178\",\"scheduled_at\":\"2026-10-07T15:41:00.000Z\"}', '::1', '2026-10-30 20:41:59'),
(66, '8c721ea4-719f-4150-9685-728e840f1a9d', 'user', 0, NULL, NULL, 'interview.feedback', 'interview', '924dac4b-6d78-412a-b236-134eeba41dc2', '{\"status\":\"completed\",\"outcome\":\"passed\"}', 'unknown', '2026-10-30 20:47:04'),
(67, 'a8becfbf-4d50-47b1-b8b6-f3d0c2366fa1', 'user', 1, 'Arbaz Ali ', 'org_admin', 'interview.feedback', 'interview', '924dac4b-6d78-412a-b236-134eeba41dc2', '{\"status\":\"completed\",\"outcome\":\"passed\"}', '::1', '2026-10-30 20:47:04'),
(68, 'ce5a8d5d-f8c0-4474-9a3f-f17719d0aaa9', 'user', 0, NULL, NULL, 'candidate.stage.selected', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"from\":\"interview\",\"to\":\"selected\"}', 'unknown', '2026-10-30 20:47:33'),
(69, '5c739e27-b5a3-4e53-b1f3-4e2bf5b05c73', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.selected', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"stage\":\"selected\"}', '::1', '2026-10-30 20:47:33'),
(70, '382e37c1-6fca-4782-a3f3-49feca4ab0e0', 'user', 0, NULL, NULL, 'letter_template.create', 'hr_letter', '67015b8f-623d-44bc-9f7e-284f5f75d82b', '{\"organization_id\":1,\"letterType\":\"offer\"}', 'unknown', '2026-10-30 20:49:57'),
(71, 'e8e0e704-0ae0-46c9-829e-37f8abddeab2', 'user', 0, NULL, NULL, 'candidate.offer.start', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"stage\":\"offered\",\"offer_status\":\"ready\",\"interview_override\":false}', 'unknown', '2026-10-30 20:50:43'),
(72, 'db534dd4-5a83-40aa-b3d0-2ab54f3f3c59', 'user', 0, NULL, NULL, 'candidate.offer.send', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"snapshot_hash\":\"1abf23d6eb9af3e63d5a14ad2e59e7bae5b2b5915317c0471769b6a6ef533323\"}', 'unknown', '2026-10-30 20:52:05'),
(73, 'e90caa22-279c-40c1-b376-dfdf762fb031', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.offer.send', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"candidate_uuid\":\"619c5d63-123d-4800-9365-bafa4086a178\",\"status\":\"sent\",\"sent_at\":\"2026-10-30T15:52:05.272Z\"}', '::1', '2026-10-30 20:52:05'),
(74, '45e804ce-5ab0-4944-afb0-ded8092e9966', 'user', 1, 'Arbaz Ali ', 'org_admin', 'exit_request.complete', 'exit_request', '6e30afc7-4fce-40b2-806b-610f3e7c9c05', '{\"employee_uuid\":\"1ee2f46e-d46c-11f1-942b-9840bb468dc0\",\"employee_name\":\"Hadi Ali\"}', '::1', '2026-10-30 21:29:58'),
(75, '44464787-0052-48cb-ad3c-aec3b088603b', 'user', 0, NULL, NULL, 'candidate.create', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"opening_uuid\":\"81fe80d1-7e9b-4b3c-b393-b6ee148bd205\",\"email\":\"hunainhaider5522@gmail.com\"}', 'unknown', '2026-10-30 21:56:41'),
(76, 'aec9f523-2bc8-497a-bbfc-a48952c1c618', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.create', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"opening_uuid\":\"81fe80d1-7e9b-4b3c-b393-b6ee148bd205\",\"email\":\"hunainhaider5522@gmail.com\"}', '::1', '2026-10-30 21:56:41'),
(77, 'be669ed9-0e69-4a2d-bb52-e9ea60f0882a', 'user', 0, NULL, NULL, 'candidate.stage.screening', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"from\":\"applied\",\"to\":\"screening\"}', 'unknown', '2026-10-30 21:56:44'),
(78, '0b228277-d074-45f3-844c-579f7d74e042', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.screening', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"stage\":\"screening\"}', '::1', '2026-10-30 21:56:44'),
(79, 'b3602384-4c8c-4358-bf33-053398f336e4', 'user', 0, NULL, NULL, 'candidate.stage.interview', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"from\":\"screening\",\"to\":\"interview\"}', 'unknown', '2026-10-30 21:56:46'),
(80, '146664d9-de1a-4c9d-9f55-6041138340f8', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.interview', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"stage\":\"interview\"}', '::1', '2026-10-30 21:56:46'),
(81, 'd502d574-6aca-4d5e-9279-08638876e63d', 'user', 0, NULL, NULL, 'interview.schedule', 'interview', '4ea8dc12-8232-4839-aef1-1e28b095562e', '{\"candidate_uuid\":\"a69f4063-2603-4943-b0fc-5f4aac92d555\",\"scheduled_at\":\"2026-10-12T17:11:00.000Z\"}', 'unknown', '2026-10-30 22:11:29'),
(82, '43b5b159-8cc0-44b8-81ec-a339c529b0eb', 'user', 1, 'Arbaz Ali ', 'org_admin', 'interview.schedule', 'interview', '4ea8dc12-8232-4839-aef1-1e28b095562e', '{\"candidate_uuid\":\"a69f4063-2603-4943-b0fc-5f4aac92d555\",\"scheduled_at\":\"2026-10-12T17:11:00.000Z\"}', '::1', '2026-10-30 22:11:29'),
(83, '4d9a4027-35ee-44ce-be7b-69f2a80326a8', 'user', 0, NULL, NULL, 'interview.feedback', 'interview', '4ea8dc12-8232-4839-aef1-1e28b095562e', '{\"status\":\"completed\",\"outcome\":\"passed\"}', 'unknown', '2026-10-30 22:12:39'),
(84, '34a556de-eef1-49c7-9c4e-ee401fe1a111', 'user', 1, 'Arbaz Ali ', 'org_admin', 'interview.feedback', 'interview', '4ea8dc12-8232-4839-aef1-1e28b095562e', '{\"status\":\"completed\",\"outcome\":\"passed\"}', '::1', '2026-10-30 22:12:39'),
(85, 'b9655a59-96f5-43be-bcdd-5fb0e4fff976', 'user', 0, NULL, NULL, 'candidate.stage.selected', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"from\":\"interview\",\"to\":\"selected\"}', 'unknown', '2026-10-30 22:12:49'),
(86, '37b6d2ab-261e-4cac-917a-91ad37347766', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.selected', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"stage\":\"selected\"}', '::1', '2026-10-30 22:12:49'),
(87, '5d1adac3-bd39-4320-90b0-40219e335785', 'user', 0, NULL, NULL, 'candidate.offer.start', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"stage\":\"offered\",\"offer_status\":\"ready\",\"interview_override\":false}', 'unknown', '2026-10-30 22:13:05'),
(88, '926c3b20-6b3b-4609-bdf7-7533780b9977', 'user', 0, NULL, NULL, 'candidate.offer.send', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"snapshot_hash\":\"0c0f288c45d152e0058e5d4b1501da35bbd6df427c7bde789dd185a46bf6f75f\"}', 'unknown', '2026-10-30 22:13:17'),
(89, 'c1e6d26f-a5c8-462b-8838-a40db781263a', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.offer.send', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"candidate_uuid\":\"a69f4063-2603-4943-b0fc-5f4aac92d555\",\"status\":\"sent\",\"sent_at\":\"2026-10-30T17:13:17.944Z\"}', '::1', '2026-10-30 22:13:17'),
(90, '602a425b-3f55-49fd-a982-3d957ff937e0', 'user', 0, NULL, NULL, 'candidate.hire', 'candidate', 'a69f4063-2603-4943-b0fc-5f4aac92d555', '{\"employee_uuid\":\"1e15125b-5da9-40c8-acfb-19bb963dff7e\",\"opening_uuid\":\"81fe80d1-7e9b-4b3c-b393-b6ee148bd205\",\"portal_invite_sent\":false}', 'unknown', '2026-10-30 22:13:23'),
(91, '839e7fd8-9a7d-4bfe-98b4-21cddaae043b', 'user', 0, NULL, NULL, 'candidate.create', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"opening_uuid\":\"81fe80d1-7e9b-4b3c-b393-b6ee148bd205\",\"email\":\"muhammadjunaidshahidofficial@gmail.com\"}', 'unknown', '2026-10-30 22:34:32'),
(92, '7adae32f-cf43-4751-8a81-4b43e5c0c1c0', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.create', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"opening_uuid\":\"81fe80d1-7e9b-4b3c-b393-b6ee148bd205\",\"email\":\"muhammadjunaidshahidofficial@gmail.com\"}', '::1', '2026-10-30 22:34:32'),
(93, 'b4503fad-a5f7-490e-99fe-60782d2513bb', 'user', 0, NULL, NULL, 'attachment.create', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"count\":1,\"category\":\"candidate_resume\"}', 'unknown', '2026-10-30 22:34:32'),
(94, '434adde8-eeb7-473e-980d-3ec60ae4eb60', 'user', 0, NULL, NULL, 'candidate.resume.attach', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"count\":1}', 'unknown', '2026-10-30 22:34:32'),
(95, '1c81c673-67d0-4999-8f02-f69c81356680', 'user', 0, NULL, NULL, 'candidate.stage.screening', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"from\":\"applied\",\"to\":\"screening\"}', 'unknown', '2026-10-30 22:34:43'),
(96, 'a534a7c6-33a7-4eef-a6b5-d9ba4cfa6d0c', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.screening', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"stage\":\"screening\"}', '::1', '2026-10-30 22:34:43'),
(97, 'ad40a56d-c509-4de7-b133-7e15d83ee47a', 'user', 0, NULL, NULL, 'candidate.stage.interview', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"from\":\"screening\",\"to\":\"interview\"}', 'unknown', '2026-10-30 22:34:45'),
(98, '5f3dec10-2db1-45ad-8c88-0143184859f7', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.interview', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"stage\":\"interview\"}', '::1', '2026-10-30 22:34:45'),
(99, 'a886e99d-b299-4b33-9468-98b351b3c42d', 'user', 0, NULL, NULL, 'interview.schedule', 'interview', '2c5cf850-2dee-4558-ad9d-5b05a575ac74', '{\"candidate_uuid\":\"a5841d1f-3884-41a0-8c82-3884c864a861\",\"scheduled_at\":\"2026-10-31T17:34:00.000Z\"}', 'unknown', '2026-10-30 22:35:06'),
(100, '09e95775-2173-4794-bbf6-5b44b3591b28', 'user', 1, 'Arbaz Ali ', 'org_admin', 'interview.schedule', 'interview', '2c5cf850-2dee-4558-ad9d-5b05a575ac74', '{\"candidate_uuid\":\"a5841d1f-3884-41a0-8c82-3884c864a861\",\"scheduled_at\":\"2026-10-31T17:34:00.000Z\"}', '::1', '2026-10-30 22:35:06'),
(101, 'f6d59490-36e9-4c09-9b2f-d72d12e0dac0', 'user', 352, NULL, NULL, 'interview.feedback', 'interview', '2c5cf850-2dee-4558-ad9d-5b05a575ac74', '{\"status\":\"completed\",\"outcome\":\"passed\"}', 'unknown', '2026-10-30 22:35:19'),
(102, 'b9b58b2b-b91e-40b8-ac38-e9ae0cb9c653', 'user', 4, 'Tooba', 'sub_admin', 'interview.feedback', 'interview', '2c5cf850-2dee-4558-ad9d-5b05a575ac74', '{\"status\":\"completed\",\"outcome\":\"passed\"}', '::1', '2026-10-30 22:35:19'),
(103, '09b0d749-0fb6-4733-857c-0efd8f01b3b6', 'user', 0, NULL, NULL, 'candidate.stage.selected', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"from\":\"interview\",\"to\":\"selected\"}', 'unknown', '2026-10-30 22:35:25'),
(104, '039fda32-c35d-4174-aafe-2fbc5c3f0a42', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.selected', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"stage\":\"selected\"}', '::1', '2026-10-30 22:35:25'),
(105, '3feaac0d-20a7-459c-ab43-5de07baba96b', 'user', 0, NULL, NULL, 'candidate.stage.offered', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"from\":\"selected\",\"to\":\"offered\"}', 'unknown', '2026-10-30 22:35:33'),
(106, '3e54b87d-51d4-48a6-b6b4-3820f286db1d', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.offered', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"stage\":\"offered\"}', '::1', '2026-10-30 22:35:33'),
(107, '2de62a6e-fca2-41fd-992b-e4cb2e32ca7e', 'user', 0, NULL, NULL, 'candidate.offer.start', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"stage\":\"offered\",\"offer_status\":\"ready\",\"interview_override\":false}', 'unknown', '2026-10-30 22:35:55'),
(108, '93be3700-065a-496f-93b8-9afd0d6c6e1d', 'user', 0, NULL, NULL, 'candidate.offer.send', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"snapshot_hash\":\"cfd4808f7027b6b0d4d9f2d95e2f5bd84dfe3056a8476358f597db8322e251a1\"}', 'unknown', '2026-10-30 22:36:06'),
(109, '3f06760a-c1ba-4522-a886-18bdb4825c1c', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.offer.send', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"candidate_uuid\":\"a5841d1f-3884-41a0-8c82-3884c864a861\",\"status\":\"sent\",\"sent_at\":\"2026-10-30T17:36:06.982Z\"}', '::1', '2026-10-30 22:36:07'),
(110, 'bdfcce98-0cda-4013-a22d-ea436b75152b', 'user', 0, NULL, NULL, 'candidate.hire', 'candidate', 'a5841d1f-3884-41a0-8c82-3884c864a861', '{\"employee_uuid\":\"86207d91-b251-46ed-a998-3b36cba9f939\",\"opening_uuid\":\"81fe80d1-7e9b-4b3c-b393-b6ee148bd205\",\"portal_invite_sent\":false}', 'unknown', '2026-10-30 22:36:10'),
(111, 'f5495896-7943-45da-8785-53e8e2508e60', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.stage.offered', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"stage\":\"offered\"}', '::1', '2026-10-30 22:36:17'),
(112, 'b56348ad-b075-4279-9ce3-5452deb57547', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":true,\"manage_assets\":true,\"manage_separation\":true,\"approve_expenses\":true,\"manage_recruitment\":false,\"override_failed_interview\":false}}', '::1', '2026-10-30 22:41:16'),
(113, 'bf8fb3d4-97ea-48d4-ab5e-c60948619a8b', 'admin', 2, 'Platform Admin', 'system_admin', 'user.create', 'user', 'c344496e-d489-11f1-942b-9840bb468dc0', '{\"email\":\"officeworks3244@gmail.com\",\"organization\":\"Dverif\"}', '::1', '2026-10-30 22:46:31'),
(114, 'cb8352c1-8e2b-4fb1-9a45-960f7e2da6b1', 'admin', 2, 'Platform Admin', 'system_admin', 'user.invite_resend', 'user', 'c344496e-d489-11f1-942b-9840bb468dc0', '{\"email\":\"officeworks3244@gmail.com\"}', '::1', '2026-10-30 22:47:23'),
(115, 'b7c9a04a-1642-49f6-a9a7-ddc6bb8c0668', 'system', NULL, 'safepay_webhook', 'system', 'subscription.applied', 'organization', 'c2c4d075-d489-11f1-942b-9840bb468dc0', '{\"source\":\"safepay_webhook\",\"transition\":\"upgrade_now\",\"relation\":\"upgrade\",\"before\":{\"status\":\"active\",\"plan_id\":1,\"expiry\":null},\"after\":{\"status\":\"active\",\"plan_id\":3,\"expiry\":\"2026-11-30T17:50:09.054Z\",\"pending_plan_id\":null},\"checkout_uuid\":\"3f20e24c-d48a-11f1-942b-9840bb468dc0\",\"gateway_event_id\":\"reconcile-track_396cac76-b02f-4548-85f6-ac47b68e2fcc\",\"plan\":\"Professional\"}', 'unknown', '2026-10-30 22:50:09'),
(116, '1c7cc8a5-85bd-4469-9476-5fd8296a4af2', 'user', 6, 'Office ', 'org_admin', 'offboarding.clearance_template.create', 'offboarding_clearance_template', 'ecc72b69-7b6e-4d6b-a2fb-73a4a1806c21', '{\"department\":\"Finance\",\"task_name\":\"Testing\"}', '::1', '2026-10-30 22:54:04'),
(117, '580d93d6-4401-4326-9e97-f775314c2450', 'user', 6, 'Office ', 'org_admin', 'offboarding.clearance_template.update', 'offboarding_clearance_template', 'ecc72b69-7b6e-4d6b-a2fb-73a4a1806c21', '{\"department\":\"Finance\",\"task_name\":\"Testing\",\"is_active\":0}', '::1', '2026-10-30 22:54:07'),
(118, '77ae6c0a-499d-4fb6-9df8-f9866cd31feb', 'user', 6, 'Office ', 'org_admin', 'offboarding.clearance_template.update', 'offboarding_clearance_template', 'ecc72b69-7b6e-4d6b-a2fb-73a4a1806c21', '{\"department\":\"Finance\",\"task_name\":\"Testing\",\"is_active\":1}', '::1', '2026-10-30 22:54:08'),
(119, 'dee3567d-438e-4b48-ba0f-af6e513003b4', 'user', 6, 'Office ', 'org_admin', 'offboarding.clearance_template.delete', 'offboarding_clearance_template', 'ecc72b69-7b6e-4d6b-a2fb-73a4a1806c21', '{}', '::1', '2026-10-30 22:54:10'),
(120, '9499a0d4-1112-4307-a5e8-05a9eb0ce051', 'user', 6, 'Office ', 'org_admin', 'department.create', 'department', 'fa75752b-d48a-11f1-942b-9840bb468dc0', '{\"name\":\"IT\"}', '::1', '2026-10-30 22:54:40'),
(121, '0adc620e-c3ba-4ea4-bfde-0856a473f107', 'user', 6, 'Office ', 'org_admin', 'designation.create', 'designation', '014d80d6-d48b-11f1-942b-9840bb468dc0', '{\"name\":\"Java Developer\"}', '::1', '2026-10-30 22:54:52'),
(122, '7c2ebecc-1d6d-4698-8058-e67f2720e520', 'user', 0, NULL, NULL, 'job_opening.create', 'job_opening', '5e9d6478-bdd7-4d25-a296-21b88457b53f', '{\"title\":\"Developer\",\"status\":\"open\",\"vacancies\":29}', 'unknown', '2026-10-30 22:55:17'),
(123, '369e0076-1993-44a4-afb4-699a7f53a063', 'user', 6, 'Office ', 'org_admin', 'job_opening.create', 'job_opening', '5e9d6478-bdd7-4d25-a296-21b88457b53f', '{\"title\":\"Developer\",\"status\":\"open\",\"vacancies\":29}', '::1', '2026-10-30 22:55:17'),
(124, '32b3a0a0-e745-44c1-9843-7ceff444d649', 'user', 0, NULL, NULL, 'candidate.create', 'candidate', 'ebe376c8-ffdd-4437-a24d-52cf0b41c565', '{\"opening_uuid\":\"5e9d6478-bdd7-4d25-a296-21b88457b53f\",\"email\":\"arbu1499@gmail.com\"}', 'unknown', '2026-10-30 22:55:40'),
(125, '4f8a54b2-3465-4b85-a64f-3fb1958c3c7c', 'user', 6, 'Office ', 'org_admin', 'candidate.create', 'candidate', 'ebe376c8-ffdd-4437-a24d-52cf0b41c565', '{\"opening_uuid\":\"5e9d6478-bdd7-4d25-a296-21b88457b53f\",\"email\":\"arbu1499@gmail.com\"}', '::1', '2026-10-30 22:55:40'),
(126, '896d968b-8e48-413f-ad02-6bacd0144c15', 'user', 0, NULL, NULL, 'attachment.create', 'candidate', 'ebe376c8-ffdd-4437-a24d-52cf0b41c565', '{\"count\":1,\"category\":\"candidate_resume\"}', 'unknown', '2026-10-30 22:55:41'),
(127, '51eeb7c6-613a-4a9b-8cf7-be177dd91cc9', 'user', 0, NULL, NULL, 'candidate.resume.attach', 'candidate', 'ebe376c8-ffdd-4437-a24d-52cf0b41c565', '{\"count\":1}', 'unknown', '2026-10-30 22:55:41'),
(128, 'f2ccb8d9-5ef9-4372-a59d-31c898e90cd1', 'user', 0, NULL, NULL, 'candidate.stage.screening', 'candidate', 'ebe376c8-ffdd-4437-a24d-52cf0b41c565', '{\"from\":\"applied\",\"to\":\"screening\"}', 'unknown', '2026-10-30 22:56:07'),
(129, '91b6aa49-3255-4fd3-92b0-1dfc2aa51317', 'user', 6, 'Office ', 'org_admin', 'candidate.stage.screening', 'candidate', 'ebe376c8-ffdd-4437-a24d-52cf0b41c565', '{\"stage\":\"screening\"}', '::1', '2026-10-30 22:56:07'),
(130, '3c095cb8-d135-4fd2-91f1-f7ab11f0e538', 'user', 0, NULL, NULL, 'candidate.stage.interview', 'candidate', 'ebe376c8-ffdd-4437-a24d-52cf0b41c565', '{\"from\":\"screening\",\"to\":\"interview\"}', 'unknown', '2026-10-30 22:56:08'),
(131, 'b6b641c4-e179-44b2-93a9-4f5d9848e574', 'user', 6, 'Office ', 'org_admin', 'candidate.stage.interview', 'candidate', 'ebe376c8-ffdd-4437-a24d-52cf0b41c565', '{\"stage\":\"interview\"}', '::1', '2026-10-30 22:56:08'),
(132, '2a0fcceb-ae33-4d9b-a566-5da0a36d63e4', 'user', 1, 'Arbaz Ali ', 'org_admin', 'expense_category.create', 'expense_category', 'e460530d-a976-4462-ab04-daaf61f49472', '{\"name\":\"testing\",\"requires_receipt\":1}', '::1', '2026-10-31 01:18:17'),
(133, 'f4068dfe-5ac2-49b6-bb28-55ef2c49ceea', 'user', 0, NULL, NULL, 'hr_letter.create', 'hr_letter', '8a4f71e5-d49f-11f1-9047-9840bb468dc0', '{\"organization_id\":1,\"letterType\":\"increment\",\"employeeUuid\":\"86207d91-b251-46ed-a998-3b36cba9f939\"}', 'unknown', '2026-10-31 01:21:51'),
(134, 'a4864410-6c44-4561-84bf-01ecaac01ab9', 'user', 1, 'Arbaz Ali ', 'org_admin', 'salary_component.create', 'salary_component', '5e4719bb-d4a6-11f1-9047-9840bb468dc0', '{\"name\":\"Transport Allonwce\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"0.00\"}', '::1', '2026-10-31 02:10:43'),
(135, 'cd435202-72ff-4f26-ab08-df490c656b6f', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '99f0981b-d504-11f1-80de-9840bb468dc0', '{\"name\":\"Transport 1793435116337\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(136, '34879f1b-e570-4433-8959-464282e6c5d8', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '99f237c1-d504-11f1-80de-9840bb468dc0', '{\"name\":\"Tax 1793435116337\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(137, '2351e2eb-1a9c-470d-ac53-5da6d97949d6', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '99f31b66-d504-11f1-80de-9840bb468dc0', '{\"name\":\"House Rent 1793435116337\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(138, '40994721-d915-4a76-98d6-900864eb3163', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.assign', 'employee', '99e78ab2-d504-11f1-80de-9840bb468dc0', '{\"salary_component_id\":2,\"name\":\"Transport 1793435116337\",\"amount\":5000}', '127.0.0.1', '2026-10-31 13:25:16'),
(139, '23db9ba3-848e-45d4-84b7-84074c4eeb92', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.assign', 'employee', '99e78ab2-d504-11f1-80de-9840bb468dc0', '{\"salary_component_id\":3,\"name\":\"Tax 1793435116337\",\"amount\":1000}', '127.0.0.1', '2026-10-31 13:25:16'),
(140, 'a42bd83a-d930-44b0-8fef-a13b85512e0b', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.assign', 'employee', '99e78ab2-d504-11f1-80de-9840bb468dc0', '{\"salary_component_id\":4,\"name\":\"House Rent 1793435116337\",\"amount\":10}', '127.0.0.1', '2026-10-31 13:25:16'),
(141, '27d65d1f-4178-4ca8-a47f-f3ec464c7732', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '9a00cfbc-d504-11f1-80de-9840bb468dc0', '{\"name\":\"Mobile Allowance 1793435116337\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2000.00\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(142, '40ad3fb4-b53f-41e7-ab58-b11e5edc4ffc', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.assign', 'employee', '99faa09b-d504-11f1-80de-9840bb468dc0', '{\"salary_component_id\":5,\"name\":\"Mobile Allowance 1793435116337\",\"amount\":2000}', '127.0.0.1', '2026-10-31 13:25:16'),
(143, '19c88fcd-acba-44d7-a053-5e45adbb32bd', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '9a0df0cc-d504-11f1-80de-9840bb468dc0', '{\"name\":\"Fuel Allowance 1793435116337\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2500.00\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(144, '90fb52a0-ae6c-4df0-968c-15a5effc2f79', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.assign', 'employee', '9a05177f-d504-11f1-80de-9840bb468dc0', '{\"salary_component_id\":6,\"name\":\"Fuel Allowance 1793435116337\",\"amount\":2500}', '127.0.0.1', '2026-10-31 13:25:16'),
(145, 'ab8f0834-636d-46ef-8b78-08545bdfbffe', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.update', 'employee', '9a05177f-d504-11f1-80de-9840bb468dc0', '{\"assignment_uuid\":\"9a0ea09f-d504-11f1-80de-9840bb468dc0\",\"name\":\"Fuel Allowance 1793435116337\",\"amount\":2500}', '127.0.0.1', '2026-10-31 13:25:16'),
(146, 'e3fd5eb5-8795-45d3-be01-d737d25bf6b9', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '9a199010-d504-11f1-80de-9840bb468dc0', '{\"name\":\"Internet Allowance 1793435116337\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1800.00\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(147, '979f07d4-df6a-4c1e-b51d-ee6d1147bb47', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.assign', 'employee', '9a134c52-d504-11f1-80de-9840bb468dc0', '{\"salary_component_id\":7,\"name\":\"Internet Allowance 1793435116337\",\"amount\":1800}', '127.0.0.1', '2026-10-31 13:25:16'),
(148, 'd7fa0a63-2cb7-44f4-9032-2750fc6aaea2', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.status_toggle', 'salary_component', '9a199010-d504-11f1-80de-9840bb468dc0', '{\"name\":\"Internet Allowance 1793435116337\",\"type\":\"allowance\",\"is_active\":0}', '127.0.0.1', '2026-10-31 13:25:16'),
(149, '60c324a6-429f-4994-8dae-3b5d2d769c62', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '9a23a148-d504-11f1-80de-9840bb468dc0', '{\"name\":\"Utility Allowance 1793435116337\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(150, '70cb8b5d-c111-45be-8d24-af1cc7c058d3', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.assign', 'employee', '9a1eac37-d504-11f1-80de-9840bb468dc0', '{\"salary_component_id\":8,\"name\":\"Utility Allowance 1793435116337\",\"amount\":1000}', '127.0.0.1', '2026-10-31 13:25:16'),
(151, 'fae61210-1bc5-4679-a26c-6cca38bb2746', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.update', 'employee', '9a1eac37-d504-11f1-80de-9840bb468dc0', '{\"assignment_uuid\":\"9a24393d-d504-11f1-80de-9840bb468dc0\",\"name\":\"Utility Allowance 1793435116337\",\"amount\":4500}', '127.0.0.1', '2026-10-31 13:25:16'),
(152, '9558bd92-3d66-47af-91fe-633a02acfc5e', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '9a2714a2-d504-11f1-80de-9840bb468dc0', '{\"name\":\"Filter Allowance 1793435116337\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(153, '318832c3-46f9-4cd5-8457-60cfa2a818a9', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '9a27ac06-d504-11f1-80de-9840bb468dc0', '{\"name\":\"Other Tenant Component 1793435116337\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(154, 'bd5df5db-0be8-4ab8-9e76-562e0c6aaaf7', 'user', 28, 'UnpaidLeaveFlow 7', 'employee', 'leave.create', 'leave_request', '9a2fd5ae-d504-11f1-80de-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":2,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-07\"}', '::1', '2026-10-31 13:25:16'),
(155, '4ecf5540-6d5a-4a74-a65d-808760c323e0', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'leave.approve', 'leave_request', '9a2fd5ae-d504-11f1-80de-9840bb468dc0', '{\"status\":\"approved\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(156, 'bdc0d419-b3e8-4c9c-8b2f-1a581adaa209', 'user', 29, 'RejectedLeave 8', 'employee', 'leave.create', 'leave_request', '9a3e99da-d504-11f1-80de-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 13:25:16'),
(157, '7769b9b0-b76e-4f47-895f-54c9fa7e602a', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'leave.reject', 'leave_request', '9a3e99da-d504-11f1-80de-9840bb468dc0', '{\"status\":\"rejected\"}', '127.0.0.1', '2026-10-31 13:25:16'),
(158, 'a3888413-f647-4b00-b984-54462c10c730', 'user', 30, 'InsufficientLeave 9', 'employee', 'leave.create', 'leave_request', '9a4ac91d-d504-11f1-80de-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":2,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-07\"}', '::1', '2026-10-31 13:25:17'),
(159, '5462be9a-9e48-40cc-a39a-1df92a9f9c9c', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'leave.reject', 'leave_request', '9a4ac91d-d504-11f1-80de-9840bb468dc0', '{\"status\":\"rejected\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(160, '79c1b2c7-d439-4996-87b1-764f4c9d1e3b', 'user', 32, 'PaidLeaveFlow 11', 'employee', 'leave.create', 'leave_request', '9a5bec20-d504-11f1-80de-9840bb468dc0', '{\"leave_type\":\"Sick Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 13:25:17'),
(161, '78b91f27-1b2d-47cb-914d-eed3273f73e0', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'leave.approve', 'leave_request', '9a5bec20-d504-11f1-80de-9840bb468dc0', '{\"status\":\"approved\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(162, 'cbc6a2d6-36ef-48ec-8c00-58f11b65f880', 'user', 33, 'AllocationEdit 12', 'employee', 'leave.create', 'leave_request', '9a684a28-d504-11f1-80de-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-06\"}', '::1', '2026-10-31 13:25:17'),
(163, '56f1eb28-fdef-421f-af66-4ca44b423371', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'leave.approve', 'leave_request', '9a684a28-d504-11f1-80de-9840bb468dc0', '{\"status\":\"approved\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(164, '6b365738-e18a-415d-a5e2-c940b3abf073', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'leave_allocation.set', 'employee_leave_allocation', '29', '{\"employee_uuid\":\"9a6135b6-d504-11f1-80de-9840bb468dc0\",\"leave_type_id\":5,\"year\":2026,\"allocated_days\":8}', '127.0.0.1', '2026-10-31 13:25:17'),
(165, '88f1dd78-b34b-4c59-ace4-bf5f97933e46', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'attendance.manual_entry', 'attendance_record', '9a6ff92a-d504-11f1-80de-9840bb468dc0', '{\"employee_uuid\":\"9a6dd824-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-05\",\"check_in_time\":\"08:55\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(166, 'd801de26-5698-4fbd-b5d1-3e8e6f16963f', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'attendance.manual_entry', 'attendance_record', '9a71f6bc-d504-11f1-80de-9840bb468dc0', '{\"employee_uuid\":\"9a6dd824-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-06\",\"check_in_time\":\"09:45\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(167, '765ed25b-baf1-4346-95ac-c60d8af73570', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'attendance.manual_entry', 'attendance_record', '9a729f9d-d504-11f1-80de-9840bb468dc0', '{\"employee_uuid\":\"9a6dd824-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-07\",\"check_in_time\":\"10:15\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 13:25:17');
INSERT INTO `audit_logs` (`id`, `uuid`, `actor_type`, `actor_id`, `actor_name`, `actor_role`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `created_at`) VALUES
(168, 'e9a1cb8a-19d2-4050-97dc-dfdf0284eab5', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'attendance.manual_entry', 'attendance_record', '9a7341ae-d504-11f1-80de-9840bb468dc0', '{\"employee_uuid\":\"9a6dd824-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-08\",\"check_in_time\":\"11:30\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(169, '232e5fef-2a9f-4dff-bc75-b68bce8c270a', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'attendance.manual_entry', 'attendance_record', '9a7666fb-d504-11f1-80de-9840bb468dc0', '{\"employee_uuid\":\"9a75a993-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"WeekendEntry 14\",\"date\":\"2026-10-03\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"Weekend cover\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(170, '36647a19-a6dd-4621-890b-f5e8da360741', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'attendance.manual_entry', 'attendance_record', '9a795695-d504-11f1-80de-9840bb468dc0', '{\"employee_uuid\":\"9a7898f2-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"AttendanceValidation 15\",\"date\":\"2026-10-05\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"First entry\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(171, '20168092-e4fe-4798-9ef7-b4c8c0de92be', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'attendance.ip_add', 'organization', '14', '{\"ip\":\"10.90.90.90\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(172, '80a8f7de-b1ff-4907-810d-6ce014a7c0dc', 'user', 37, 'SelfAttendance 16', 'employee', 'attendance.check_in', 'attendance_record', '9a7e3b1b-d504-11f1-80de-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 13:25:17'),
(173, 'b3f326a9-0d9f-43b5-9d73-babad87d5e13', 'user', 37, 'SelfAttendance 16', 'employee', 'attendance.check_out', 'attendance_record', '9a7e3b1b-d504-11f1-80de-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 13:25:17'),
(174, '4d7ceb68-c7e5-47da-8f1e-2bc3ca94916c', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'overtime.create', 'overtime_request', '9a87b036-d504-11f1-80de-9840bb468dc0', '{\"employee_uuid\":\"9a81992d-d504-11f1-80de-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":8}', '127.0.0.1', '2026-10-31 13:25:17'),
(175, '32539dc4-1169-4cb1-a5c3-a98f756c4cfa', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'overtime.decide', 'overtime_request', '9a87b036-d504-11f1-80de-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":8,\"approved_hours\":8}', '127.0.0.1', '2026-10-31 13:25:17'),
(176, 'ad108369-8eae-4f66-94e6-60752b1b7e0c', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'overtime.create', 'overtime_request', '9a8a9e87-d504-11f1-80de-9840bb468dc0', '{\"employee_uuid\":\"9a81992d-d504-11f1-80de-9840bb468dc0\",\"work_date\":\"2026-10-21\",\"requested_hours\":5}', '127.0.0.1', '2026-10-31 13:25:17'),
(177, 'fd3788bf-7d64-424d-86c8-fc8ea69d0713', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'overtime.decide', 'overtime_request', '9a8a9e87-d504-11f1-80de-9840bb468dc0', '{\"status\":\"rejected\",\"requested_hours\":5,\"approved_hours\":0}', '127.0.0.1', '2026-10-31 13:25:17'),
(178, 'd5f1f16e-8a92-45f8-9f52-049905090fec', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'overtime.create', 'overtime_request', '9a8b7fc2-d504-11f1-80de-9840bb468dc0', '{\"employee_uuid\":\"9a81992d-d504-11f1-80de-9840bb468dc0\",\"work_date\":\"2026-10-22\",\"requested_hours\":4}', '127.0.0.1', '2026-10-31 13:25:17'),
(179, 'f60e3033-ac36-4c94-8fab-dc085591a41e', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '9a92144b-d504-11f1-80de-9840bb468dc0', '{\"name\":\"FullChain Transport 1793435116337\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(180, '55a91a81-2a23-4263-8519-18c159894686', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '9a929c01-d504-11f1-80de-9840bb468dc0', '{\"name\":\"FullChain Tax 1793435116337\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(181, 'e117ed74-fe42-4f79-9ff1-ee62c9d3f9d1', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'salary_component.create', 'salary_component', '9a931720-d504-11f1-80de-9840bb468dc0', '{\"name\":\"FullChain Rent 1793435116337\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 13:25:17'),
(182, 'fde9bd63-3610-4dee-a203-cfc1ea74b361', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.assign', 'employee', '9a8d4502-d504-11f1-80de-9840bb468dc0', '{\"salary_component_id\":11,\"name\":\"FullChain Transport 1793435116337\",\"amount\":5000}', '127.0.0.1', '2026-10-31 13:25:17'),
(183, '0bc9eccb-e41d-4a0e-aff8-f9414484dd36', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.assign', 'employee', '9a8d4502-d504-11f1-80de-9840bb468dc0', '{\"salary_component_id\":12,\"name\":\"FullChain Tax 1793435116337\",\"amount\":1000}', '127.0.0.1', '2026-10-31 13:25:17'),
(184, 'c4dcef29-a63b-4b38-a360-4b5b5a988c14', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.assign', 'employee', '9a8d4502-d504-11f1-80de-9840bb468dc0', '{\"salary_component_id\":13,\"name\":\"FullChain Rent 1793435116337\",\"amount\":10}', '127.0.0.1', '2026-10-31 13:25:17'),
(185, 'fb885e3a-2a13-4e5d-8629-338b7b01db4f', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'overtime.create', 'overtime_request', '9a953355-d504-11f1-80de-9840bb468dc0', '{\"employee_uuid\":\"9a8d4502-d504-11f1-80de-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":6}', '127.0.0.1', '2026-10-31 13:25:17'),
(186, 'a3693ef0-560c-45c4-ad02-57a619c13b1e', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'overtime.decide', 'overtime_request', '9a953355-d504-11f1-80de-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":6,\"approved_hours\":6}', '127.0.0.1', '2026-10-31 13:25:17'),
(187, 'a3d0e1c2-cdbf-417a-b3e7-75fcf6eb4899', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":0}', '127.0.0.1', '2026-10-31 13:25:17'),
(188, 'bbff3cd7-9213-4fa2-8832-ea76038d1f77', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'employee_salary_component.update', 'employee', '9a8d4502-d504-11f1-80de-9840bb468dc0', '{\"assignment_uuid\":\"9a93a686-d504-11f1-80de-9840bb468dc0\",\"name\":\"FullChain Transport 1793435116337\",\"amount\":7000}', '127.0.0.1', '2026-10-31 13:25:17'),
(189, 'c56d257c-d18e-4640-b314-aff7fb26d861', 'user', 22, 'Payroll Admin 1793435116337', 'org_admin', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":0}', '127.0.0.1', '2026-10-31 13:25:17'),
(190, '407924b2-3cea-4117-b99a-069a8de0a2e0', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '9b2a067a-d504-11f1-80de-9840bb468dc0', '{\"organization_id\":17,\"assignment_uuid\":\"9b2c4fc2-d504-11f1-80de-9840bb468dc0\",\"employee_uuid\":\"9b273965-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"ITmvw4ypvx1\"}', 'unknown', '2026-10-31 13:25:18'),
(191, '1bc9d3ab-54af-4554-b019-a7fb453ad6a2', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '9b3b6afe-d504-11f1-80de-9840bb468dc0', '{\"organization_id\":18,\"assignment_uuid\":\"9b3bf742-d504-11f1-80de-9840bb468dc0\",\"employee_uuid\":\"9b3a3487-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"ITmvw4ypzf4\"}', 'unknown', '2026-10-31 13:25:18'),
(192, 'f8dff294-fdd2-4fc7-8ddf-36aa03b648cc', 'user', NULL, NULL, NULL, 'asset.return', 'asset', '9b3b6afe-d504-11f1-80de-9840bb468dc0', '{\"organization_id\":18,\"condition\":\"good\",\"notes\":null,\"opened_job\":null}', 'unknown', '2026-10-31 13:25:18'),
(193, 'a1dad0d7-8673-49a6-bb1a-197f8bae1137', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '9b47d3d0-d504-11f1-80de-9840bb468dc0', '{\"organization_id\":19,\"assignment_uuid\":\"9b4862a6-d504-11f1-80de-9840bb468dc0\",\"employee_uuid\":\"9b43f596-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"ITmvw4yq177\"}', 'unknown', '2026-10-31 13:25:18'),
(194, '6b549709-645c-4e6a-b1f3-26b28343ea70', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '9b5aa0ec-d504-11f1-80de-9840bb468dc0', '{\"organization_id\":22,\"assignment_uuid\":\"9b5b18f3-d504-11f1-80de-9840bb468dc0\",\"employee_uuid\":\"9b588e3c-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"ITmvw4yq4y12\"}', 'unknown', '2026-10-31 13:25:18'),
(195, '0dcf371a-5f04-4469-8dcd-fc1bf8cec2a2', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '9b696df8-d504-11f1-80de-9840bb468dc0', '{\"organization_id\":24,\"assignment_uuid\":\"9b6a0be5-d504-11f1-80de-9840bb468dc0\",\"employee_uuid\":\"9b6899f7-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"ITmvw4yq7v16\"}', 'unknown', '2026-10-31 13:25:18'),
(196, 'b1606e74-64b1-4dc2-815f-6cc26be88d7c', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '9b72a320-d504-11f1-80de-9840bb468dc0', '{\"organization_id\":25,\"assignment_uuid\":\"9b734137-d504-11f1-80de-9840bb468dc0\",\"employee_uuid\":\"9b713491-d504-11f1-80de-9840bb468dc0\",\"employee_name\":\"ITmvw4yq9f19\"}', 'unknown', '2026-10-31 13:25:18'),
(197, '7eaefd90-f174-49c8-9d7c-e4a52c74eefe', 'user', NULL, NULL, NULL, 'asset.maintenance.report', 'asset', '9b72a320-d504-11f1-80de-9840bb468dc0', '{\"organization_id\":25,\"maintenance_uuid\":\"9b74a922-d504-11f1-80de-9840bb468dc0\",\"vendor\":null,\"cost\":null}', 'unknown', '2026-10-31 13:25:18'),
(198, '14db5201-50c2-40c7-b50a-faf9c556fa48', 'user', NULL, NULL, NULL, 'asset.maintenance.complete', 'asset', '9b72a320-d504-11f1-80de-9840bb468dc0', '{\"organization_id\":25,\"maintenance_uuid\":\"9b74a922-d504-11f1-80de-9840bb468dc0\",\"status\":\"completed\"}', 'unknown', '2026-10-31 13:25:19'),
(199, '95fc56b9-23ee-43c1-badd-8cf11ce93297', 'user', 1, 'Org Admin', 'org_admin', 'employee.create', 'employee', '9e2df400-d504-11f1-80de-9840bb468dc0', '{\"full_name\":\"Returning Person\",\"email\":\"rehire-1793435123522-1@example.com\",\"organization_id\":33,\"created_platform_user\":false,\"linked_existing_account\":false,\"email_sent\":false}', '127.0.0.1', '2026-10-31 13:25:23'),
(200, 'a8c5137b-c75d-4a93-a644-05147d218082', 'user', 1, 'Org Admin', 'org_admin', 'employee.create', 'employee', '9e33a057-d504-11f1-80de-9840bb468dc0', '{\"full_name\":\"New Employment\",\"email\":\"rehire-1793435123522-7@example.com\",\"organization_id\":33,\"created_platform_user\":false,\"linked_existing_account\":false,\"email_sent\":false}', '127.0.0.1', '2026-10-31 13:25:23'),
(201, '99d10e8b-11e3-4826-a785-39db61e4c843', 'user', 1, 'Org Admin', 'org_admin', 'employee.create', 'employee', '9e3679ef-d504-11f1-80de-9840bb468dc0', '{\"full_name\":\"Returning Person\",\"email\":\"rehire-1793435123522-9@example.com\",\"organization_id\":33,\"created_platform_user\":true,\"linked_existing_account\":true,\"email_sent\":false}', '127.0.0.1', '2026-10-31 13:25:23'),
(202, '85724fcb-461a-4d16-ab5e-0dfd60b2bea4', 'user', 58, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 13:35:11'),
(203, '376d4b4a-3d03-4622-976d-6d2a0228d7f6', 'user', 58, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":2,\"expense_claims_paid\":2}', 'unknown', '2026-10-31 13:35:11'),
(204, '4a5cd624-a574-4b03-a302-9bcf34143121', 'user', 58, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 13:35:11'),
(205, 'b5bf17c8-206f-4be0-b8b6-8a6554d69277', 'user', 58, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:35:11'),
(206, '3de72503-6e5c-4cce-88ce-9581fb1044cb', 'user', 58, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":4,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:35:11'),
(207, '4cd05489-0d73-49ad-8c99-85e9e66866c3', 'user', 58, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":5,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:35:11'),
(208, '44ec20aa-473a-404b-a556-ee91f9b0bca7', 'user', 58, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":6,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:35:11'),
(209, '96444c2d-079d-4157-af84-c3682b4ec06e', 'user', 59, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 13:41:17'),
(210, '1162f5db-ed56-4531-8dc0-bfd338695d16', 'user', 59, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":2,\"expense_claims_paid\":2}', 'unknown', '2026-10-31 13:41:17'),
(211, 'f602b6dd-09b6-4284-9e5d-9d178925a5c0', 'user', 59, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 13:41:17'),
(212, 'c5ea4bb6-3a65-49e8-babc-6a3027a7bdd7', 'user', 59, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:41:17'),
(213, '824e056a-32e1-4327-9602-f750d78bef5c', 'user', 59, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":4,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:41:17'),
(214, 'e6fb7d20-805d-49cd-a8e2-d6df3619d801', 'user', 59, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":5,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:41:17'),
(215, 'f133375e-7fef-4476-9421-a47b638ed862', 'user', 59, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":6,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:41:17'),
(216, 'be784258-32b1-4561-b1a1-de13cd472d67', 'user', 60, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 13:41:50'),
(217, '850ee01e-5579-4879-b6bb-4322c69bc91b', 'user', 60, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":2,\"expense_claims_paid\":2}', 'unknown', '2026-10-31 13:41:51'),
(218, 'c5f20d64-b42b-4b24-94d7-3026fc2b5683', 'user', 60, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 13:41:51'),
(219, 'e21e7bd0-33a5-4222-9785-0419006fcad8', 'user', 60, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:41:51'),
(220, '2127431a-90c8-432b-b21a-5c150ceaa29c', 'user', 60, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":4,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:41:51'),
(221, '86e45781-749f-4066-81c9-fea0830c1be0', 'user', 60, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":5,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:41:51'),
(222, 'cc270081-f073-483e-ab7a-7251cd1be9c4', 'user', 60, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":6,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:41:51'),
(223, '488bfdd9-ef6f-4e22-aac4-1483f1a378c5', 'user', 61, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 13:43:18'),
(224, '79726db0-e874-43af-8388-6a1ea5f99534', 'user', 61, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":2,\"expense_claims_paid\":2}', 'unknown', '2026-10-31 13:43:18'),
(225, '8b83b070-d98e-4cf2-b67f-17cd7c7b96f3', 'user', 61, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 13:43:18'),
(226, '071a48c3-905a-4c66-a9ac-e9f17a64f1f6', 'user', 61, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:43:18'),
(227, 'e9d58254-53df-481b-896e-28393c9367cb', 'user', 61, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":4,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:43:18'),
(228, 'a2d7d34a-24d5-4380-91ae-8798b2ba5001', 'user', 61, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":5,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:43:18'),
(229, '745cd0b8-bf41-4dcd-a81e-8b7959bd0ceb', 'user', 61, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":6,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:43:18'),
(230, 'dab339fe-b2eb-4158-ad0b-beaa4bd4ffb3', 'user', 62, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 13:43:34'),
(231, 'c7967117-5722-4585-b4fb-8a02ac814cc8', 'user', 62, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":2,\"expense_claims_paid\":2}', 'unknown', '2026-10-31 13:43:34'),
(232, 'ce5546a4-cf3a-43f7-8c4e-3fd9f1ea80de', 'user', 62, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 13:43:34'),
(233, 'fd47131f-7e6d-4ec2-87c4-a7462b9986c0', 'user', 62, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:43:34'),
(234, '981abe31-3918-486a-a95c-4abd8287d527', 'user', 62, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":4,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:43:34'),
(235, '11334c59-0a57-4c5b-b6e0-b3785f599871', 'user', 62, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":5,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:43:34'),
(236, 'bd71ddf5-c257-4cce-8c4b-2a7a41fff497', 'user', 62, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":6,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 13:43:34'),
(237, '9e71e01e-b33a-4e65-ad20-cbad8789dec7', 'user', 1, NULL, NULL, 'expense_claim.auto_approve.refused', 'expense_claim', '33cd0649-b0ec-4d36-bb64-6c8e2a28561f', '{\"reason\":\"Auto-approval requires the approve_expenses permission, which this account does not have\"}', 'unknown', '2026-10-31 14:26:51'),
(238, '0802cd27-acd7-4294-b667-0c249d48ec30', 'user', 3, 'Hadi Ali', 'employee', 'expense_claim.submit_self', 'expense_claim', '33cd0649-b0ec-4d36-bb64-6c8e2a28561f', '{\"amount\":2000,\"expense_date\":\"2026-10-31\",\"auto_approve_requested\":false,\"auto_approve_refusal\":\"Auto-approval requires the approve_expenses permission, which this account does not have\"}', '::1', '2026-10-31 14:26:51'),
(239, 'bae7c362-a418-48b1-a10b-1146a07cad35', 'user', 1, 'Arbaz Ali ', 'org_admin', 'expense_claim.approved', 'expense_claim', '33cd0649-b0ec-4d36-bb64-6c8e2a28561f', '{\"amount\":2000,\"rejection_reason\":null,\"payment_mode\":\"payroll\"}', '::1', '2026-10-31 14:27:04'),
(240, 'e13aca36-aac2-4474-9b79-a6adcd0197ca', 'user', 0, NULL, NULL, 'asset.create', 'asset', '3365fc53-d50e-11f1-80de-9840bb468dc0', '{\"organization_id\":1,\"asset_tag\":\"AST-0001\"}', 'unknown', '2026-10-31 14:33:59'),
(241, '249d4ef7-221f-4fe6-85fb-82a2cda711e4', 'user', 0, NULL, NULL, 'asset.assign', 'asset', '3365fc53-d50e-11f1-80de-9840bb468dc0', '{\"organization_id\":1,\"assignment_uuid\":\"4f86a43c-d50e-11f1-80de-9840bb468dc0\",\"employee_uuid\":\"1ee2f46e-d46c-11f1-942b-9840bb468dc0\",\"employee_name\":\"Hadi Ali\"}', 'unknown', '2026-10-31 14:34:46'),
(242, '0a2b73fb-7637-4d38-919e-0da52c6fdb5b', 'user', 0, NULL, NULL, 'hr_letter.create', 'hr_letter', '67e85465-d50f-11f1-80de-9840bb468dc0', '{\"organization_id\":1,\"letterType\":\"offer\",\"employeeUuid\":\"86207d91-b251-46ed-a998-3b36cba9f939\"}', 'unknown', '2026-10-31 14:42:36'),
(243, '908a9064-5e35-4649-aeda-a8d85dbfdebf', 'user', 0, NULL, NULL, 'hr_letter.issue', 'hr_letter', '67e85465-d50f-11f1-80de-9840bb468dc0', '{\"organization_id\":1,\"referenceNo\":\"HR/2026/0002\",\"letterType\":\"offer\"}', 'unknown', '2026-10-31 14:42:42'),
(244, 'e6e909d6-80d0-4006-a81a-4d782fe9bbba', 'user', 0, NULL, NULL, 'hr_letter.issue', 'hr_letter', '8a4f71e5-d49f-11f1-9047-9840bb468dc0', '{\"organization_id\":1,\"referenceNo\":\"HR/2026/0001\",\"letterType\":\"increment\"}', 'unknown', '2026-10-31 14:42:53'),
(245, 'c96abe98-9955-4c09-84c2-3005b15b7569', 'user', 1, 'Org Admin', 'org_admin', 'employee.create', 'employee', '7187476f-d52e-11f1-9f66-9840bb468dc0', '{\"full_name\":\"Returning Person\",\"email\":\"rehire-1793453087466-1@example.com\",\"organization_id\":52,\"created_platform_user\":false,\"linked_existing_account\":false,\"email_sent\":false}', '127.0.0.1', '2026-10-31 18:24:47'),
(246, '30613bf6-b2ba-4811-8d01-6f213e090c45', 'user', 1, 'Org Admin', 'org_admin', 'employee.create', 'employee', '718fdf73-d52e-11f1-9f66-9840bb468dc0', '{\"full_name\":\"New Employment\",\"email\":\"rehire-1793453087466-7@example.com\",\"organization_id\":52,\"created_platform_user\":false,\"linked_existing_account\":false,\"email_sent\":false}', '127.0.0.1', '2026-10-31 18:24:47'),
(247, '7609768d-5a41-43ff-b7d6-d16a2df95c8e', 'user', 1, 'Org Admin', 'org_admin', 'employee.create', 'employee', '7193d9b5-d52e-11f1-9f66-9840bb468dc0', '{\"full_name\":\"Returning Person\",\"email\":\"rehire-1793453087466-9@example.com\",\"organization_id\":52,\"created_platform_user\":true,\"linked_existing_account\":true,\"email_sent\":false}', '127.0.0.1', '2026-10-31 18:24:47'),
(248, '8bc084b8-dd25-4654-b051-fa20101bf984', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '77739e59-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Transport 1793453097351\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 18:24:57'),
(249, '3dd5be34-3387-4e69-a062-aaffd094d390', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '777532a2-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Tax 1793453097351\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:24:57'),
(250, 'adf66f54-d11d-4db7-8cec-2271a69124e3', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '777662b2-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"House Rent 1793453097351\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 18:24:57'),
(251, '117264ac-b800-4a4f-a31c-27e7210055f7', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.assign', 'employee', '776af904-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":14,\"name\":\"Transport 1793453097351\",\"amount\":5000}', '127.0.0.1', '2026-10-31 18:24:57'),
(252, 'a7ba9a15-c393-4d90-89da-5f02a9966c2f', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.assign', 'employee', '776af904-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":15,\"name\":\"Tax 1793453097351\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:24:57'),
(253, '8912a863-4750-4307-aa64-6ceed625ea72', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.assign', 'employee', '776af904-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":16,\"name\":\"House Rent 1793453097351\",\"amount\":10}', '127.0.0.1', '2026-10-31 18:24:57'),
(254, 'ad78db8b-39c4-4697-bc39-9f61d19f84cb', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '778e4a97-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Mobile Allowance 1793453097351\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2000.00\"}', '127.0.0.1', '2026-10-31 18:24:57'),
(255, 'eea4bfd8-868b-464d-8905-1782087279d5', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.assign', 'employee', '77862fff-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":17,\"name\":\"Mobile Allowance 1793453097351\",\"amount\":2000}', '127.0.0.1', '2026-10-31 18:24:57'),
(256, 'fc0ca313-fe07-41a8-8cf2-eb58a821a68d', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '77996876-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Fuel Allowance 1793453097351\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2500.00\"}', '127.0.0.1', '2026-10-31 18:24:57'),
(257, '5b85e282-3df0-4b84-bec8-828e713f7d16', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.assign', 'employee', '7792385e-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":18,\"name\":\"Fuel Allowance 1793453097351\",\"amount\":2500}', '127.0.0.1', '2026-10-31 18:24:57'),
(258, '02482ac2-963d-4b68-b42c-443ffef88de1', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '77a2c2ee-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Internet Allowance 1793453097351\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1800.00\"}', '127.0.0.1', '2026-10-31 18:24:57'),
(259, '18a72e0d-afe8-4ec0-955a-aa9a429289df', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.assign', 'employee', '779bf81e-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":19,\"name\":\"Internet Allowance 1793453097351\",\"amount\":1800}', '127.0.0.1', '2026-10-31 18:24:57'),
(260, '74c574fa-42a6-4e95-a930-b0d25c8d2502', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '77aaf569-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Utility Allowance 1793453097351\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:24:57'),
(261, 'fc1ea85d-1af1-446d-b597-7667664abc0d', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.assign', 'employee', '77a4f90c-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":20,\"name\":\"Utility Allowance 1793453097351\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:24:57'),
(262, 'b0a5a6cf-abec-49a9-ab71-ab8089e58f24', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.update', 'employee', '77a4f90c-d52e-11f1-9f66-9840bb468dc0', '{\"assignment_uuid\":\"77abc028-d52e-11f1-9f66-9840bb468dc0\",\"name\":\"Utility Allowance 1793453097351\",\"amount\":4500}', '127.0.0.1', '2026-10-31 18:24:57'),
(263, '7d56f9fe-8b83-4890-affe-b2ca42d6a1b0', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '77adb23f-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Filter Allowance 1793453097351\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 18:24:57'),
(264, 'c35db733-582e-4ec0-92f1-a6c318e7b096', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '77ae93c3-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Other Tenant Component 1793453097351\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 18:24:57'),
(265, '02823c8a-5edc-4c96-acdb-d78aa5af41ac', 'user', 89, 'RejectedLeave 8', 'employee', 'leave.create', 'leave_request', '77bce94c-d52e-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 18:24:57'),
(266, '984602e8-77f2-4936-80e7-f6b6a9e3c630', 'user', 90, 'InsufficientLeave 9', 'employee', 'leave.create', 'leave_request', '77c8efc1-d52e-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":2,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-07\"}', '::1', '2026-10-31 18:24:58'),
(267, '9d371505-2249-4e46-ae49-d0c88b16444e', 'user', 93, 'AllocationEdit 12', 'employee', 'leave.create', 'leave_request', '77d8db1d-d52e-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-06\"}', '::1', '2026-10-31 18:24:58'),
(268, 'adb9ca70-83b0-49ae-a75e-1c1abe1c6449', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'leave.approve', 'leave_request', '77d8db1d-d52e-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":\"unpaid\"}', '127.0.0.1', '2026-10-31 18:24:58'),
(269, 'af661d6d-fbbb-4fec-89a5-97afbeeadac1', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'leave_allocation.set', 'employee_leave_allocation', '49', '{\"employee_uuid\":\"77d094b7-d52e-11f1-9f66-9840bb468dc0\",\"leave_type_id\":11,\"year\":2026,\"allocated_days\":8}', '127.0.0.1', '2026-10-31 18:24:58'),
(270, '06f721ec-a751-4394-88d9-8be8232f0c67', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'attendance.manual_entry', 'attendance_record', '77e357a7-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"77e28a6d-d52e-11f1-9f66-9840bb468dc0\",\"employee_name\":\"WeekendEntry 14\",\"date\":\"2026-10-03\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"Weekend cover\"}', '127.0.0.1', '2026-10-31 18:24:58'),
(271, 'fe5e66a1-266e-4c51-b4a8-005bb101042f', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'attendance.manual_entry', 'attendance_record', '77e726ea-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"77e5c6a3-d52e-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceValidation 15\",\"date\":\"2026-10-05\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"First entry\"}', '127.0.0.1', '2026-10-31 18:24:58'),
(272, '288a1a27-9550-46ab-9970-230aa733176a', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'attendance.ip_add', 'organization', '59', '{\"ip\":\"10.90.90.90\"}', '127.0.0.1', '2026-10-31 18:24:58'),
(273, '4d905296-5dc0-4a35-9073-1f610799f51a', 'user', 97, 'SelfAttendance 16', 'employee', 'attendance.check_in', 'attendance_record', '77ecdccc-d52e-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 18:24:58'),
(274, 'aa63c956-4066-4d15-b339-8b40c7e74077', 'user', 97, 'SelfAttendance 16', 'employee', 'attendance.check_out', 'attendance_record', '77ecdccc-d52e-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 18:24:58'),
(275, 'd679d928-eeb1-4a3d-9d83-4f06fde04926', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'overtime.create', 'overtime_request', '77fab51d-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"77f17fda-d52e-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":8}', '127.0.0.1', '2026-10-31 18:24:58'),
(276, 'c43f958f-5e63-4ee2-96d3-0f9a4ecde07c', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'overtime.decide', 'overtime_request', '77fab51d-d52e-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":8,\"approved_hours\":8}', '127.0.0.1', '2026-10-31 18:24:58'),
(277, '3eb67c1f-ec4b-4323-a481-1c74207a1f45', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'overtime.create', 'overtime_request', '7801b2e2-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"77f17fda-d52e-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-21\",\"requested_hours\":5}', '127.0.0.1', '2026-10-31 18:24:58'),
(278, '3373f78d-e213-4fde-9966-6218e7b4ac39', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'overtime.decide', 'overtime_request', '7801b2e2-d52e-11f1-9f66-9840bb468dc0', '{\"status\":\"rejected\",\"requested_hours\":5,\"approved_hours\":0}', '127.0.0.1', '2026-10-31 18:24:58'),
(279, 'd32d387c-900a-4564-b1fe-07c9e2a2ea49', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'overtime.create', 'overtime_request', '7803585b-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"77f17fda-d52e-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-22\",\"requested_hours\":4}', '127.0.0.1', '2026-10-31 18:24:58'),
(280, '76b16977-9be2-4bfe-9bdb-79ab167ff954', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '780bb95f-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Transport 1793453097351\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 18:24:58'),
(281, 'e6ac9573-a659-4f83-88ec-4dc884ae8c50', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '780c5053-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Tax 1793453097351\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:24:58'),
(282, '22c701ac-8cd2-4156-a8bb-662a04846e1b', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'salary_component.create', 'salary_component', '780cdf13-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Rent 1793453097351\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 18:24:58'),
(283, '6ffb47bb-ae38-4e9b-84f3-f3cfc4c4aa97', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.assign', 'employee', '78056fbe-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":23,\"name\":\"FullChain Transport 1793453097351\",\"amount\":5000}', '127.0.0.1', '2026-10-31 18:24:58'),
(284, '314f8c87-82d4-4539-b49e-a59be02d41d0', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.assign', 'employee', '78056fbe-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":24,\"name\":\"FullChain Tax 1793453097351\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:24:58'),
(285, 'e9237e24-3d11-4ab7-9693-4bd8511f9c44', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'employee_salary_component.assign', 'employee', '78056fbe-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":25,\"name\":\"FullChain Rent 1793453097351\",\"amount\":10}', '127.0.0.1', '2026-10-31 18:24:58'),
(286, '7155ea03-53c5-4355-b718-a0349a4d042d', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'overtime.create', 'overtime_request', '78157ebf-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"78056fbe-d52e-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":6}', '127.0.0.1', '2026-10-31 18:24:58'),
(287, '2a2b787e-4a19-4e3c-9b41-cc7fbec9a856', 'user', 82, 'Payroll Admin 1793453097351', 'org_admin', 'overtime.decide', 'overtime_request', '78157ebf-d52e-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":6,\"approved_hours\":6}', '127.0.0.1', '2026-10-31 18:24:58'),
(288, 'cdee5bb1-d6d1-41d1-a4df-77801ee0e7e9', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '7a4e92de-d52e-11f1-9f66-9840bb468dc0', '{\"organization_id\":65,\"assignment_uuid\":\"7a51496c-d52e-11f1-9f66-9840bb468dc0\",\"employee_uuid\":\"7a4c4fc8-d52e-11f1-9f66-9840bb468dc0\",\"employee_name\":\"ITmvwfo6881\"}', 'unknown', '2026-10-31 18:25:02'),
(289, 'f8b5db3e-a64b-4342-9c11-c8bb5f2d4c89', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '7a5f69d7-d52e-11f1-9f66-9840bb468dc0', '{\"organization_id\":66,\"assignment_uuid\":\"7a600468-d52e-11f1-9f66-9840bb468dc0\",\"employee_uuid\":\"7a5e3f28-d52e-11f1-9f66-9840bb468dc0\",\"employee_name\":\"ITmvwfo6bl3\"}', 'unknown', '2026-10-31 18:25:02'),
(290, '19df555a-3189-433c-af2a-8ff522a2db68', 'user', NULL, NULL, NULL, 'asset.return', 'asset', '7a5f69d7-d52e-11f1-9f66-9840bb468dc0', '{\"organization_id\":66,\"condition\":\"good\",\"notes\":null}', 'unknown', '2026-10-31 18:25:02'),
(291, 'a133edb4-b2ef-47d1-a380-bec740ecec34', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '7a6d5d41-d52e-11f1-9f66-9840bb468dc0', '{\"organization_id\":67,\"assignment_uuid\":\"7a6e02b9-d52e-11f1-9f66-9840bb468dc0\",\"employee_uuid\":\"7a6911bc-d52e-11f1-9f66-9840bb468dc0\",\"employee_name\":\"ITmvwfo6dk5\"}', 'unknown', '2026-10-31 18:25:02'),
(292, 'c004d7e3-46ea-4df7-ac21-57600e2a1d17', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '7a83726d-d52e-11f1-9f66-9840bb468dc0', '{\"organization_id\":70,\"assignment_uuid\":\"7a83f400-d52e-11f1-9f66-9840bb468dc0\",\"employee_uuid\":\"7a818bab-d52e-11f1-9f66-9840bb468dc0\",\"employee_name\":\"ITmvwfo6i09\"}', 'unknown', '2026-10-31 18:25:02'),
(293, 'ad43aef7-6123-4029-a67d-3ece8f8c8fa4', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', '7a9cae55-d52e-11f1-9f66-9840bb468dc0', '{\"organization_id\":72,\"assignment_uuid\":\"7a9d725f-d52e-11f1-9f66-9840bb468dc0\",\"employee_uuid\":\"7a9c48d1-d52e-11f1-9f66-9840bb468dc0\",\"employee_name\":\"ITmvwfo6mu12\"}', 'unknown', '2026-10-31 18:25:02'),
(294, '46f7ee4e-a6de-4c91-b0da-ac967baa2a1a', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8a645349-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Transport 1793453129128\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 18:25:29'),
(295, '2921106a-6d6f-41bb-a78b-8f452ba0e04f', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8a65c418-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Tax 1793453129128\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:25:29'),
(296, '95ff5f6d-53e4-4d28-9680-cb755dcdc1c8', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8a672835-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"House Rent 1793453129128\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 18:25:29'),
(297, '8894718f-083e-4b76-ac98-f77bd2cda368', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.assign', 'employee', '8a5c74d2-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":26,\"name\":\"Transport 1793453129128\",\"amount\":5000}', '127.0.0.1', '2026-10-31 18:25:29'),
(298, 'd44e396e-8220-4721-9b29-adfffd0e37aa', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.assign', 'employee', '8a5c74d2-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":27,\"name\":\"Tax 1793453129128\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:25:29'),
(299, 'fd82e7e2-8e2e-427e-a473-a49503b9351e', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.assign', 'employee', '8a5c74d2-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":28,\"name\":\"House Rent 1793453129128\",\"amount\":10}', '127.0.0.1', '2026-10-31 18:25:29'),
(300, 'b154df09-238f-4c94-9caf-be31d26f76f2', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8a79ff8e-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Mobile Allowance 1793453129128\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2000.00\"}', '127.0.0.1', '2026-10-31 18:25:29'),
(301, '8be67ee1-d2a5-48f5-b179-42d38ddb985c', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.assign', 'employee', '8a73c348-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":29,\"name\":\"Mobile Allowance 1793453129128\",\"amount\":2000}', '127.0.0.1', '2026-10-31 18:25:29'),
(302, '0dba955b-3e38-496e-a9f2-60042bbcadd0', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8a915777-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Fuel Allowance 1793453129128\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2500.00\"}', '127.0.0.1', '2026-10-31 18:25:29'),
(303, '782030c4-d22c-4bcc-84ef-bb707e678b13', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.assign', 'employee', '8a7e3210-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":30,\"name\":\"Fuel Allowance 1793453129128\",\"amount\":2500}', '127.0.0.1', '2026-10-31 18:25:29'),
(304, '20c2c7ad-ff7e-4c2d-abc8-f760b025eb70', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8a994703-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Internet Allowance 1793453129128\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1800.00\"}', '127.0.0.1', '2026-10-31 18:25:29'),
(305, 'd5df0ce2-dd89-4dcc-aca9-2e63bfd1d909', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.assign', 'employee', '8a939a53-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":31,\"name\":\"Internet Allowance 1793453129128\",\"amount\":1800}', '127.0.0.1', '2026-10-31 18:25:29'),
(306, '20d5c3cd-d0ec-4679-9bcf-3c096ec78ec7', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8aa1a0c9-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Utility Allowance 1793453129128\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:25:29'),
(307, '743b73d5-d0bd-44cb-b059-382fdfd84c11', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.assign', 'employee', '8a9bff6f-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":32,\"name\":\"Utility Allowance 1793453129128\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:25:29'),
(308, '1e020c53-b4d5-42e9-ada5-0a09794a8902', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.update', 'employee', '8a9bff6f-d52e-11f1-9f66-9840bb468dc0', '{\"assignment_uuid\":\"8aa23582-d52e-11f1-9f66-9840bb468dc0\",\"name\":\"Utility Allowance 1793453129128\",\"amount\":4500}', '127.0.0.1', '2026-10-31 18:25:29'),
(309, 'affe81fe-eba9-430f-af56-f6b7928b7f2f', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8aa479a3-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Filter Allowance 1793453129128\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 18:25:29'),
(310, '8b964349-f040-43f8-810c-8eff235c3c8d', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8aa511d1-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"Other Tenant Component 1793453129128\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 18:25:29'),
(311, '62797164-a994-4642-bbb4-eee01c67eac8', 'user', 119, 'RejectedLeave 8', 'employee', 'leave.create', 'leave_request', '8abe3893-d52e-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 18:25:29'),
(312, '2ddb9af3-6960-437a-ad8a-973bca465ed6', 'user', 120, 'InsufficientLeave 9', 'employee', 'leave.create', 'leave_request', '8acbc47e-d52e-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":2,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-07\"}', '::1', '2026-10-31 18:25:29'),
(313, '8283bd4e-5f28-4af2-8567-b42bd13e2b3b', 'user', 123, 'AllocationEdit 12', 'employee', 'leave.create', 'leave_request', '8adab246-d52e-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-06\"}', '::1', '2026-10-31 18:25:30'),
(314, 'c53e1c41-5cff-4d6d-89e5-241733c66c0d', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'leave.approve', 'leave_request', '8adab246-d52e-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":\"unpaid\"}', '127.0.0.1', '2026-10-31 18:25:30'),
(315, 'f29d735a-5471-45e3-965b-24083b341d30', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'leave_allocation.set', 'employee_leave_allocation', '55', '{\"employee_uuid\":\"8ad34166-d52e-11f1-9f66-9840bb468dc0\",\"leave_type_id\":15,\"year\":2026,\"allocated_days\":8}', '127.0.0.1', '2026-10-31 18:25:30'),
(316, 'c64d9452-7f78-42e6-b6b5-3309b06b75a0', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'attendance.manual_entry', 'attendance_record', '8ae22e44-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"8ae1666e-d52e-11f1-9f66-9840bb468dc0\",\"employee_name\":\"WeekendEntry 14\",\"date\":\"2026-10-03\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"Weekend cover\"}', '127.0.0.1', '2026-10-31 18:25:30'),
(317, 'a0760802-1b3e-4544-b3e8-17e36243b94c', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'attendance.manual_entry', 'attendance_record', '8ae44e19-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"8ae38105-d52e-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceValidation 15\",\"date\":\"2026-10-05\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"First entry\"}', '127.0.0.1', '2026-10-31 18:25:30'),
(318, '8efd8ac3-8795-4f5b-9e47-49afbadd6c28', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'attendance.ip_add', 'organization', '76', '{\"ip\":\"10.90.90.90\"}', '127.0.0.1', '2026-10-31 18:25:30'),
(319, '440ff24f-9829-4667-b47a-bcf768e76eb4', 'user', 127, 'SelfAttendance 16', 'employee', 'attendance.check_in', 'attendance_record', '8ae90b49-d52e-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 18:25:30'),
(320, 'e33b270b-4853-4db7-9e6b-f569d46e6809', 'user', 127, 'SelfAttendance 16', 'employee', 'attendance.check_out', 'attendance_record', '8ae90b49-d52e-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 18:25:30'),
(321, '9dcb094e-603b-462e-b47c-2a80c229c1cd', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'overtime.create', 'overtime_request', '8af42948-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"8aed6baa-d52e-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":8}', '127.0.0.1', '2026-10-31 18:25:30'),
(322, 'd9e96228-f039-456c-bcca-2ca422e501b0', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'overtime.decide', 'overtime_request', '8af42948-d52e-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":8,\"approved_hours\":8}', '127.0.0.1', '2026-10-31 18:25:30'),
(323, '3ebf0bef-8226-411b-8469-7e0e83e51611', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'overtime.create', 'overtime_request', '8af749be-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"8aed6baa-d52e-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-21\",\"requested_hours\":5}', '127.0.0.1', '2026-10-31 18:25:30'),
(324, 'b3f84219-1598-4736-9534-23fdabf62b6d', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'overtime.decide', 'overtime_request', '8af749be-d52e-11f1-9f66-9840bb468dc0', '{\"status\":\"rejected\",\"requested_hours\":5,\"approved_hours\":0}', '127.0.0.1', '2026-10-31 18:25:30'),
(325, '992a0dcc-395c-4e95-8c89-abf26cb5e3bf', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'overtime.create', 'overtime_request', '8af8618d-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"8aed6baa-d52e-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-22\",\"requested_hours\":4}', '127.0.0.1', '2026-10-31 18:25:30'),
(326, '39f3849c-06a0-434f-94db-1f7ab46f1617', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8aff2829-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Transport 1793453129128\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 18:25:30'),
(327, 'ef156530-4deb-418f-b30e-6ae7fca5dbee', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8affe740-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Tax 1793453129128\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:25:30'),
(328, '6b6ecb9e-254f-4cde-a364-516a2b95223a', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'salary_component.create', 'salary_component', '8b0042fa-d52e-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Rent 1793453129128\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 18:25:30'),
(329, '1801b62f-5cd6-4825-a68c-becae54ac866', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.assign', 'employee', '8af9db8b-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":35,\"name\":\"FullChain Transport 1793453129128\",\"amount\":5000}', '127.0.0.1', '2026-10-31 18:25:30'),
(330, '2021bd51-ffd6-4e20-9ac8-562120719eb8', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.assign', 'employee', '8af9db8b-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":36,\"name\":\"FullChain Tax 1793453129128\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:25:30'),
(331, '479de0bd-e7af-4d66-b7bb-3b8bdb65dd9a', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'employee_salary_component.assign', 'employee', '8af9db8b-d52e-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":37,\"name\":\"FullChain Rent 1793453129128\",\"amount\":10}', '127.0.0.1', '2026-10-31 18:25:30'),
(332, '856ad69e-9133-4734-bfa2-0eb6c66d9807', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'overtime.create', 'overtime_request', '8b02bd75-d52e-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"8af9db8b-d52e-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":6}', '127.0.0.1', '2026-10-31 18:25:30');
INSERT INTO `audit_logs` (`id`, `uuid`, `actor_type`, `actor_id`, `actor_name`, `actor_role`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `created_at`) VALUES
(333, 'b4343688-0212-43c7-aeff-18e03dfd892b', 'user', 112, 'Payroll Admin 1793453129128', 'org_admin', 'overtime.decide', 'overtime_request', '8b02bd75-d52e-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":6,\"approved_hours\":6}', '127.0.0.1', '2026-10-31 18:25:30'),
(334, 'd50724b9-739d-47c9-88c7-250268d945ed', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f0e6ece-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"Transport 1793453593288\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 18:33:13'),
(335, '334d5a00-2aff-418d-a540-f5a0826a5162', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f0fb6c0-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"Tax 1793453593288\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:33:13'),
(336, 'e2c911bb-9113-4cf8-8453-794f744cf493', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f10c15a-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"House Rent 1793453593288\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 18:33:13'),
(337, '3dd155ed-976c-43e6-abba-5959c8f07cf3', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.assign', 'employee', '9f05e928-d52f-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":38,\"name\":\"Transport 1793453593288\",\"amount\":5000}', '127.0.0.1', '2026-10-31 18:33:13'),
(338, '3a6630b1-9e27-4e17-b6da-2e2cc1e4dbac', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.assign', 'employee', '9f05e928-d52f-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":39,\"name\":\"Tax 1793453593288\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:33:13'),
(339, '5c9724ab-befa-49fc-8584-ef002677ec72', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.assign', 'employee', '9f05e928-d52f-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":40,\"name\":\"House Rent 1793453593288\",\"amount\":10}', '127.0.0.1', '2026-10-31 18:33:13'),
(340, 'e1b6113c-8a39-4283-b5d7-7b0747e7ff9b', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f2265a2-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"Mobile Allowance 1793453593288\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2000.00\"}', '127.0.0.1', '2026-10-31 18:33:13'),
(341, '4b57a753-6d82-4d7a-8457-1bebbd62c740', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.assign', 'employee', '9f1c6280-d52f-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":41,\"name\":\"Mobile Allowance 1793453593288\",\"amount\":2000}', '127.0.0.1', '2026-10-31 18:33:13'),
(342, '5668da64-b7fb-4f8d-8cd9-343b6f1257ac', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f2bd6ff-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"Fuel Allowance 1793453593288\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2500.00\"}', '127.0.0.1', '2026-10-31 18:33:13'),
(343, '4e636465-5af8-4f11-891c-a010595e4c62', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.assign', 'employee', '9f255ed3-d52f-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":42,\"name\":\"Fuel Allowance 1793453593288\",\"amount\":2500}', '127.0.0.1', '2026-10-31 18:33:13'),
(344, '95a5c7ac-16c6-4197-8a71-f92527002f5f', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f336481-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"Internet Allowance 1793453593288\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1800.00\"}', '127.0.0.1', '2026-10-31 18:33:13'),
(345, '76bfba90-058b-4c94-a626-b6979d13ca61', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.assign', 'employee', '9f2e2288-d52f-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":43,\"name\":\"Internet Allowance 1793453593288\",\"amount\":1800}', '127.0.0.1', '2026-10-31 18:33:13'),
(346, '703a27be-9b66-4d2d-baca-75ec37f71fb3', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f3b714b-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"Utility Allowance 1793453593288\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:33:13'),
(347, 'eca24311-62b9-4c52-b2e9-01e5b1be2cc4', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.assign', 'employee', '9f35bb34-d52f-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":44,\"name\":\"Utility Allowance 1793453593288\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:33:13'),
(348, 'f32997b5-0f42-4278-b4dc-83a69617faae', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.update', 'employee', '9f35bb34-d52f-11f1-9f66-9840bb468dc0', '{\"assignment_uuid\":\"9f3c32ee-d52f-11f1-9f66-9840bb468dc0\",\"name\":\"Utility Allowance 1793453593288\",\"amount\":4500}', '127.0.0.1', '2026-10-31 18:33:13'),
(349, 'fabe9e10-1bb3-48d1-a3f2-f923b05adc2f', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f3e4866-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"Filter Allowance 1793453593288\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 18:33:13'),
(350, '25b4fd0e-bf2f-432f-8b6b-893bdceefb82', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f417ff5-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"Other Tenant Component 1793453593288\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 18:33:13'),
(351, '7805c074-d2bb-4eff-b92f-8013972d294e', 'user', 138, 'RejectedLeave 8', 'employee', 'leave.create', 'leave_request', '9f4fa353-d52f-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 18:33:13'),
(352, 'd233c0eb-6e98-453d-a647-75f676c57648', 'user', 139, 'InsufficientLeave 9', 'employee', 'leave.create', 'leave_request', '9f58c91f-d52f-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":2,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-07\"}', '::1', '2026-10-31 18:33:13'),
(353, 'ad031d7d-0507-4b63-b635-38eda4191a9e', 'user', 142, 'AllocationEdit 12', 'employee', 'leave.create', 'leave_request', '9f66b225-d52f-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-06\"}', '::1', '2026-10-31 18:33:13'),
(354, 'e9332886-1a11-4aaa-b630-e21ce79e9506', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'leave.approve', 'leave_request', '9f66b225-d52f-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":\"unpaid\"}', '127.0.0.1', '2026-10-31 18:33:13'),
(355, 'b2d51227-03e6-45e1-8e79-ccdf10e15035', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'leave_allocation.set', 'employee_leave_allocation', '61', '{\"employee_uuid\":\"9f603c70-d52f-11f1-9f66-9840bb468dc0\",\"leave_type_id\":19,\"year\":2026,\"allocated_days\":8}', '127.0.0.1', '2026-10-31 18:33:14'),
(356, '6951b9fc-7bba-47ad-8fa3-d86c62dca21c', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'attendance.manual_entry', 'attendance_record', '9f6e9ae1-d52f-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"9f6da510-d52f-11f1-9f66-9840bb468dc0\",\"employee_name\":\"WeekendEntry 14\",\"date\":\"2026-10-03\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"Weekend cover\"}', '127.0.0.1', '2026-10-31 18:33:14'),
(357, 'f54d3c07-6092-4e83-9f65-ac0c56212455', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'attendance.manual_entry', 'attendance_record', '9f7231d7-d52f-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"9f70f0b3-d52f-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceValidation 15\",\"date\":\"2026-10-05\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"First entry\"}', '127.0.0.1', '2026-10-31 18:33:14'),
(358, 'd41357ed-131b-4024-9d7e-b2e33dd43360', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'attendance.ip_add', 'organization', '80', '{\"ip\":\"10.90.90.90\"}', '127.0.0.1', '2026-10-31 18:33:14'),
(359, 'f305b51c-447e-4cb2-baec-8d4abd5affde', 'user', 146, 'SelfAttendance 16', 'employee', 'attendance.check_in', 'attendance_record', '9f77b19f-d52f-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 18:33:14'),
(360, '9a70caa3-e46a-4ee2-9106-483562f5b7e6', 'user', 146, 'SelfAttendance 16', 'employee', 'attendance.check_out', 'attendance_record', '9f77b19f-d52f-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 18:33:14'),
(361, '77631fa5-3103-4251-8596-cbec0c4e59b4', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'overtime.create', 'overtime_request', '9f8f7855-d52f-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"9f809df0-d52f-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":8}', '127.0.0.1', '2026-10-31 18:33:14'),
(362, '7ae75cc1-c1b2-4283-9eca-ee142f67ef61', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'overtime.decide', 'overtime_request', '9f8f7855-d52f-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":8,\"approved_hours\":8}', '127.0.0.1', '2026-10-31 18:33:14'),
(363, 'b0e425c4-0708-478f-9eee-98b5b0d33890', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'overtime.create', 'overtime_request', '9f91dfd7-d52f-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"9f809df0-d52f-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-21\",\"requested_hours\":5}', '127.0.0.1', '2026-10-31 18:33:14'),
(364, 'aec5c063-9796-48f0-8a4f-e8475732f7ee', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'overtime.decide', 'overtime_request', '9f91dfd7-d52f-11f1-9f66-9840bb468dc0', '{\"status\":\"rejected\",\"requested_hours\":5,\"approved_hours\":0}', '127.0.0.1', '2026-10-31 18:33:14'),
(365, 'a01dab23-b683-43f0-b78b-f0a5dcf66a42', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'overtime.create', 'overtime_request', '9f92e6a8-d52f-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"9f809df0-d52f-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-22\",\"requested_hours\":4}', '127.0.0.1', '2026-10-31 18:33:14'),
(366, '5804806e-a63c-4f86-9dfe-374509ebe745', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f9a58b4-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Transport 1793453593288\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 18:33:14'),
(367, '369d49e1-f5f3-45c1-a8ef-b96f34fc836a', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f9aebd9-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Tax 1793453593288\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:33:14'),
(368, 'c86ea064-ca4a-4e8c-8c58-8dbd0d9b2a8b', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'salary_component.create', 'salary_component', '9f9b5ce2-d52f-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Rent 1793453593288\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 18:33:14'),
(369, '1f369cb1-e40f-45db-8224-da420c83d4f2', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.assign', 'employee', '9f94ce9f-d52f-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":47,\"name\":\"FullChain Transport 1793453593288\",\"amount\":5000}', '127.0.0.1', '2026-10-31 18:33:14'),
(370, '71ceab40-348f-4aa1-8f62-a5ff14a0b5d4', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.assign', 'employee', '9f94ce9f-d52f-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":48,\"name\":\"FullChain Tax 1793453593288\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:33:14'),
(371, '9971f15e-2a71-43f7-a9d1-5b26e3e97b27', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'employee_salary_component.assign', 'employee', '9f94ce9f-d52f-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":49,\"name\":\"FullChain Rent 1793453593288\",\"amount\":10}', '127.0.0.1', '2026-10-31 18:33:14'),
(372, '0126a0ad-bb10-4c10-ac19-326fcaba6958', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'overtime.create', 'overtime_request', '9f9f44ba-d52f-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"9f94ce9f-d52f-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":6}', '127.0.0.1', '2026-10-31 18:33:14'),
(373, 'a42cffa1-dac1-426d-8f8b-75db90ccc8c6', 'user', 131, 'Payroll Admin 1793453593288', 'org_admin', 'overtime.decide', 'overtime_request', '9f9f44ba-d52f-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":6,\"approved_hours\":6}', '127.0.0.1', '2026-10-31 18:33:14'),
(374, '2c1f506d-cf1a-4fc8-9b75-805c44c958de', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '6260a0d3-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Transport 1793454779873\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(375, '06fd6f29-110f-4874-9ac5-e1c40d74ad3e', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '6262f61a-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Tax 1793454779873\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(376, '1f848d90-0b29-4bab-ab41-cf0593e7d19e', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '6264bcfe-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"House Rent 1793454779873\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(377, 'b5958690-363b-426b-827d-2bb91e8d994f', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.assign', 'employee', '6256ac0f-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":50,\"name\":\"Transport 1793454779873\",\"amount\":5000}', '127.0.0.1', '2026-10-31 18:53:00'),
(378, 'b5340439-742c-4668-a7a8-0e301da3b77f', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.assign', 'employee', '6256ac0f-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":51,\"name\":\"Tax 1793454779873\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:53:00'),
(379, '02929d28-7ba7-4cf7-b39e-468ebf08ba3e', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.assign', 'employee', '6256ac0f-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":52,\"name\":\"House Rent 1793454779873\",\"amount\":10}', '127.0.0.1', '2026-10-31 18:53:00'),
(380, 'b75b790b-09e7-434e-94f3-cbf751d29ddf', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '627cb77e-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Mobile Allowance 1793454779873\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2000.00\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(381, 'd5371a8d-7a52-4563-8186-1d618d24d766', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.assign', 'employee', '6275334d-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":53,\"name\":\"Mobile Allowance 1793454779873\",\"amount\":2000}', '127.0.0.1', '2026-10-31 18:53:00'),
(382, 'dc03be6d-9ef6-4bae-95e0-2b78b21236f0', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '628b9d7f-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Fuel Allowance 1793454779873\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2500.00\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(383, 'cc3b8308-47e0-4b49-bd6a-17fc7759c8d4', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.assign', 'employee', '6281e6c0-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":54,\"name\":\"Fuel Allowance 1793454779873\",\"amount\":2500}', '127.0.0.1', '2026-10-31 18:53:00'),
(384, 'db950e87-c710-409c-bacb-b6b82b52b637', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.update', 'employee', '6281e6c0-d532-11f1-9f66-9840bb468dc0', '{\"assignment_uuid\":\"628c87d2-d532-11f1-9f66-9840bb468dc0\",\"name\":\"Fuel Allowance 1793454779873\",\"amount\":2500}', '127.0.0.1', '2026-10-31 18:53:00'),
(385, 'cdd91b47-9414-4ec6-9c56-b0bfd9afea86', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '629a4d08-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Internet Allowance 1793454779873\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1800.00\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(386, '051c02d6-f24a-4960-9170-dfea937fdc51', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.assign', 'employee', '6293b1c6-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":55,\"name\":\"Internet Allowance 1793454779873\",\"amount\":1800}', '127.0.0.1', '2026-10-31 18:53:00'),
(387, '51b7254f-a699-4d3a-9609-c16f9ef4ab7b', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.status_toggle', 'salary_component', '629a4d08-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Internet Allowance 1793454779873\",\"type\":\"allowance\",\"is_active\":0}', '127.0.0.1', '2026-10-31 18:53:00'),
(388, '3076c523-6836-4858-81b8-c5e8736e7e1e', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '62a705bd-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Utility Allowance 1793454779873\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(389, '98eb4211-6178-43e0-b1c5-cfef853a9fe8', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.assign', 'employee', '62a0751a-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":56,\"name\":\"Utility Allowance 1793454779873\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:53:00'),
(390, 'd84f3df1-36e1-439a-886e-370f1e719e73', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.update', 'employee', '62a0751a-d532-11f1-9f66-9840bb468dc0', '{\"assignment_uuid\":\"62a80c87-d532-11f1-9f66-9840bb468dc0\",\"name\":\"Utility Allowance 1793454779873\",\"amount\":4500}', '127.0.0.1', '2026-10-31 18:53:00'),
(391, '3469e1f8-1bbd-4716-8854-997479e5be2e', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '62abab64-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Filter Allowance 1793454779873\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(392, 'a755151a-9bc4-49f0-8a93-7f7232f69df1', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '62acdb59-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Other Tenant Component 1793454779873\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(393, 'adeca680-5b8b-4e89-a52e-7cbb780422d6', 'user', 157, 'RejectedLeave 8', 'employee', 'leave.create', 'leave_request', '62c32ee0-d532-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 18:53:00'),
(394, 'cdb00575-c843-4af7-a2d7-51e83b5f0f42', 'user', 158, 'InsufficientLeave 9', 'employee', 'leave.create', 'leave_request', '62cf6b60-d532-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":2,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-07\"}', '::1', '2026-10-31 18:53:00'),
(395, '885409f6-7e32-4450-b059-b40ffaeb47ae', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'leave.reject', 'leave_request', '62cf6b60-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"rejected\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":null}', '127.0.0.1', '2026-10-31 18:53:00'),
(396, 'f6d2483a-3eaf-41db-b202-835e5e0f712b', 'user', 160, 'PaidLeaveFlow 11', 'employee', 'leave.create', 'leave_request', '62d96953-d532-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Sick Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 18:53:00'),
(397, 'b3f91513-2312-4676-9f4a-ecda8fa223fa', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'leave.approve', 'leave_request', '62d96953-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":\"unpaid\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(398, 'b5f293c8-6615-4274-a9df-88509004d912', 'user', 161, 'AllocationEdit 12', 'employee', 'leave.create', 'leave_request', '62e3ed1c-d532-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-06\"}', '::1', '2026-10-31 18:53:00'),
(399, '2c4d10db-3a9a-4b5c-abca-dac3a39a8c86', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'leave.approve', 'leave_request', '62e3ed1c-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":\"unpaid\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(400, '5a8e2118-ceef-4a0e-8615-90e64fd88c16', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'leave_allocation.set', 'employee_leave_allocation', '81', '{\"employee_uuid\":\"62de4802-d532-11f1-9f66-9840bb468dc0\",\"leave_type_id\":23,\"year\":2026,\"allocated_days\":8}', '127.0.0.1', '2026-10-31 18:53:00'),
(401, '1b500c95-49d1-4733-a13b-0df1c297e759', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'attendance.manual_entry', 'attendance_record', '62ea0fc6-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"62e83822-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-05\",\"check_in_time\":\"08:55\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(402, '9fa53884-b22d-48f5-80fe-2bae9eeb26fb', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'attendance.manual_entry', 'attendance_record', '62ebb0ea-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"62e83822-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-06\",\"check_in_time\":\"09:45\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(403, 'd983834d-969a-4e2c-953d-f2bd467c80be', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'attendance.manual_entry', 'attendance_record', '62ec7316-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"62e83822-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-07\",\"check_in_time\":\"10:15\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 18:53:00'),
(404, '3bd1eafb-277e-47f1-931c-d23d272d19c1', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'attendance.manual_entry', 'attendance_record', '62ed0571-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"62e83822-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-08\",\"check_in_time\":\"11:30\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 18:53:01'),
(405, '44f4eb0e-c3a9-482b-b689-2c4220af5ce3', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'attendance.manual_entry', 'attendance_record', '62efa2ff-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"62ef0d01-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"WeekendEntry 14\",\"date\":\"2026-10-03\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"Weekend cover\"}', '127.0.0.1', '2026-10-31 18:53:01'),
(406, '738ea03f-33f7-4fce-8b36-ab224961d7db', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'attendance.manual_entry', 'attendance_record', '62f2215a-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"62f189ce-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceValidation 15\",\"date\":\"2026-10-05\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"First entry\"}', '127.0.0.1', '2026-10-31 18:53:01'),
(407, '93ff30d9-43db-48fe-bc30-4da1a6e7b36a', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'attendance.ip_add', 'organization', '84', '{\"ip\":\"10.90.90.90\"}', '127.0.0.1', '2026-10-31 18:53:01'),
(408, 'e8bf98a1-04cf-4749-b66b-4bd4965ec801', 'user', 165, 'SelfAttendance 16', 'employee', 'attendance.check_in', 'attendance_record', '62f618fb-d532-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 18:53:01'),
(409, '66929179-aa3c-4c15-b121-514dd6d225a8', 'user', 165, 'SelfAttendance 16', 'employee', 'attendance.check_out', 'attendance_record', '62f618fb-d532-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 18:53:01'),
(410, 'a42282a8-9f57-42c5-b157-4af64ec01569', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'overtime.create', 'overtime_request', '6300fa68-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"62fa0cf8-d532-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":8}', '127.0.0.1', '2026-10-31 18:53:01'),
(411, '08ea169f-a111-4eb1-bb44-53a6bd701dee', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'overtime.decide', 'overtime_request', '6300fa68-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":8,\"approved_hours\":8}', '127.0.0.1', '2026-10-31 18:53:01'),
(412, '098a3fb9-6e03-4dd5-b28e-34ebea56792b', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'overtime.create', 'overtime_request', '63034600-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"62fa0cf8-d532-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-21\",\"requested_hours\":5}', '127.0.0.1', '2026-10-31 18:53:01'),
(413, '898dae43-1f31-4b36-a37b-7d5c49133366', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'overtime.decide', 'overtime_request', '63034600-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"rejected\",\"requested_hours\":5,\"approved_hours\":0}', '127.0.0.1', '2026-10-31 18:53:01'),
(414, '71b9cc5b-4fbf-408c-ac89-e914ec713241', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'overtime.create', 'overtime_request', '63045d7c-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"62fa0cf8-d532-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-22\",\"requested_hours\":4}', '127.0.0.1', '2026-10-31 18:53:01'),
(415, '832f275e-8363-4a23-bfdc-af0ba53b65bc', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '631598ec-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Transport 1793454779873\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 18:53:01'),
(416, '9fd55320-ac91-44d9-80be-4ce6d377b0f0', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '63161137-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Tax 1793454779873\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:53:01'),
(417, 'f5a8c3be-b19c-459f-8871-a6e56c09635a', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'salary_component.create', 'salary_component', '631690dd-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Rent 1793454779873\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 18:53:01'),
(418, 'f67d5131-dc2d-4a15-a384-8d914ae4867d', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.assign', 'employee', '630eee98-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":59,\"name\":\"FullChain Transport 1793454779873\",\"amount\":5000}', '127.0.0.1', '2026-10-31 18:53:01'),
(419, '474822c7-7ed4-4c43-a0a6-61adb2ebba3d', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.assign', 'employee', '630eee98-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":60,\"name\":\"FullChain Tax 1793454779873\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:53:01'),
(420, '0a67f801-e20c-48d7-95d6-899db418e716', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'employee_salary_component.assign', 'employee', '630eee98-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":61,\"name\":\"FullChain Rent 1793454779873\",\"amount\":10}', '127.0.0.1', '2026-10-31 18:53:01'),
(421, '7bd22405-4da6-45d7-af36-4d91bef4f601', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'overtime.create', 'overtime_request', '631916bf-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"630eee98-d532-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":6}', '127.0.0.1', '2026-10-31 18:53:01'),
(422, '94b0e4f1-6a19-4651-805d-72c97dba5a6b', 'user', 150, 'Payroll Admin 1793454779873', 'org_admin', 'overtime.decide', 'overtime_request', '631916bf-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":6,\"approved_hours\":6}', '127.0.0.1', '2026-10-31 18:53:01'),
(423, '00149755-4285-4a89-858e-a622e951fcea', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '760eba41-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Transport 1793454812907\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(424, '2580d920-02d9-4e87-8285-4e32cdc558d8', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '76109f10-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Tax 1793454812907\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(425, '97ec46e0-59ae-445f-a023-96bc9f1cf74b', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '761183de-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"House Rent 1793454812907\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(426, 'e1f85a3b-d170-4d3d-8b87-63264d84db41', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.assign', 'employee', '7604dcb0-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":62,\"name\":\"Transport 1793454812907\",\"amount\":5000}', '127.0.0.1', '2026-10-31 18:53:33'),
(427, '869b0dde-a232-4281-9564-9fb504b42439', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.assign', 'employee', '7604dcb0-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":63,\"name\":\"Tax 1793454812907\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:53:33'),
(428, '3fb97cbe-6e34-4138-b62e-8273b9260040', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.assign', 'employee', '7604dcb0-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":64,\"name\":\"House Rent 1793454812907\",\"amount\":10}', '127.0.0.1', '2026-10-31 18:53:33'),
(429, 'e1ef9e1f-04cc-4b5b-9fd4-c0e2bee06e45', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '7622e755-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Mobile Allowance 1793454812907\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2000.00\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(430, '6b63e0fb-df43-4511-a359-5457a1a0f3a7', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.assign', 'employee', '761c4721-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":65,\"name\":\"Mobile Allowance 1793454812907\",\"amount\":2000}', '127.0.0.1', '2026-10-31 18:53:33'),
(431, '176d3479-42ad-42ce-9bbb-1c8a802db12a', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '762d2f23-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Fuel Allowance 1793454812907\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2500.00\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(432, 'f0771f4e-e968-4232-a264-786872fee512', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.assign', 'employee', '7627c696-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":66,\"name\":\"Fuel Allowance 1793454812907\",\"amount\":2500}', '127.0.0.1', '2026-10-31 18:53:33'),
(433, '24925089-805a-40e7-9d98-51f9e43b8fea', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.update', 'employee', '7627c696-d532-11f1-9f66-9840bb468dc0', '{\"assignment_uuid\":\"762dc405-d532-11f1-9f66-9840bb468dc0\",\"name\":\"Fuel Allowance 1793454812907\",\"amount\":2500}', '127.0.0.1', '2026-10-31 18:53:33'),
(434, '2615c3d1-bc1c-4edc-8758-e052b4c2a7a5', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '7638d849-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Internet Allowance 1793454812907\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1800.00\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(435, 'aaedae43-8149-4aa2-9d9c-c2ada27459b0', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.assign', 'employee', '76325aac-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":67,\"name\":\"Internet Allowance 1793454812907\",\"amount\":1800}', '127.0.0.1', '2026-10-31 18:53:33'),
(436, '5b47bc6b-8e09-49c3-aa72-10ac40e62a60', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.status_toggle', 'salary_component', '7638d849-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Internet Allowance 1793454812907\",\"type\":\"allowance\",\"is_active\":0}', '127.0.0.1', '2026-10-31 18:53:33'),
(437, 'f3ea95e8-84d5-43bb-8130-39d74ceb7b51', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '7642df0f-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Utility Allowance 1793454812907\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(438, 'e1af0329-182d-4553-b2c2-0719ad1014f9', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.assign', 'employee', '763d5a13-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":68,\"name\":\"Utility Allowance 1793454812907\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:53:33'),
(439, '40303c80-25ab-4345-885b-c4600cf1bb85', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.update', 'employee', '763d5a13-d532-11f1-9f66-9840bb468dc0', '{\"assignment_uuid\":\"764378ab-d532-11f1-9f66-9840bb468dc0\",\"name\":\"Utility Allowance 1793454812907\",\"amount\":4500}', '127.0.0.1', '2026-10-31 18:53:33'),
(440, 'b0d00a41-a101-4c1e-b7ab-7ba65cc5013d', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '764609e8-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Filter Allowance 1793454812907\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(441, 'f2f9ec73-697c-4424-9436-53f8fb713c91', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '7646c4b8-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"Other Tenant Component 1793454812907\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(442, '58f6cd13-dfb5-4594-a1a3-3d249fc4f366', 'user', 176, 'RejectedLeave 8', 'employee', 'leave.create', 'leave_request', '76632dd9-d532-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 18:53:33'),
(443, '41c21607-d0d1-4ecd-922c-f031bad83b05', 'user', 177, 'InsufficientLeave 9', 'employee', 'leave.create', 'leave_request', '767053c7-d532-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":2,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-07\"}', '::1', '2026-10-31 18:53:33'),
(444, '21173c44-b450-4da7-950c-186cba45bc3d', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'leave.reject', 'leave_request', '767053c7-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"rejected\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":null}', '127.0.0.1', '2026-10-31 18:53:33'),
(445, '638794c6-328b-4bb3-b81c-8a8ef194a4a8', 'user', 179, 'PaidLeaveFlow 11', 'employee', 'leave.create', 'leave_request', '7679e172-d532-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Sick Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 18:53:33'),
(446, '8bd1c30d-32fa-44f1-b238-8127d3d07fcc', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'leave.approve', 'leave_request', '7679e172-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":\"unpaid\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(447, '5a5922c2-3f86-4dea-8415-a125b3813eb7', 'user', 180, 'AllocationEdit 12', 'employee', 'leave.create', 'leave_request', '76845d6c-d532-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-06\"}', '::1', '2026-10-31 18:53:33'),
(448, '3ec2f806-5ef7-48dd-a53f-b933cfff293f', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'leave.approve', 'leave_request', '76845d6c-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":\"unpaid\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(449, '9049cf89-ddd4-405a-b71f-6314f59e57fd', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'leave_allocation.set', 'employee_leave_allocation', '87', '{\"employee_uuid\":\"767ec819-d532-11f1-9f66-9840bb468dc0\",\"leave_type_id\":27,\"year\":2026,\"allocated_days\":8}', '127.0.0.1', '2026-10-31 18:53:33'),
(450, '3c02e10b-d445-44f2-9253-68feddcc5e00', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'attendance.manual_entry', 'attendance_record', '768a9554-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"7688c50a-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-05\",\"check_in_time\":\"08:55\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(451, '121299d8-9b4c-4abc-b674-ca0083e51e95', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'attendance.manual_entry', 'attendance_record', '768c2a26-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"7688c50a-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-06\",\"check_in_time\":\"09:45\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(452, '7c8eb8e0-2878-410f-a5b9-e76b3113f95f', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'attendance.manual_entry', 'attendance_record', '768cec70-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"7688c50a-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-07\",\"check_in_time\":\"10:15\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(453, 'c220a277-46db-4f5f-8217-fbfb17693462', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'attendance.manual_entry', 'attendance_record', '768d7ed4-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"7688c50a-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-08\",\"check_in_time\":\"11:30\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(454, '26389b92-5432-492e-9766-3cfba2d698bd', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'attendance.manual_entry', 'attendance_record', '76902e28-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"768f9bf5-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"WeekendEntry 14\",\"date\":\"2026-10-03\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"Weekend cover\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(455, '100ac775-4ceb-44c7-9689-647810b40dd3', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'attendance.manual_entry', 'attendance_record', '7692a692-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"769217f1-d532-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceValidation 15\",\"date\":\"2026-10-05\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"First entry\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(456, '263232e0-0277-42a6-aaa1-2d5930b4c0ef', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'attendance.ip_add', 'organization', '88', '{\"ip\":\"10.90.90.90\"}', '127.0.0.1', '2026-10-31 18:53:33'),
(457, 'a1ef6ceb-d9e5-4682-94e0-8f6f0a74c58f', 'user', 184, 'SelfAttendance 16', 'employee', 'attendance.check_in', 'attendance_record', '76967181-d532-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 18:53:33'),
(458, 'e1933130-3d5d-4b9c-9cdd-ebe2466235db', 'user', 184, 'SelfAttendance 16', 'employee', 'attendance.check_out', 'attendance_record', '76967181-d532-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 18:53:33'),
(459, '93237a45-38ce-43a8-bcc5-0811817f4bd3', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'overtime.create', 'overtime_request', '769ff818-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"7699c5a7-d532-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":8}', '127.0.0.1', '2026-10-31 18:53:34'),
(460, '0210623e-fa1e-40c7-80dd-7dd9180f0a3c', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'overtime.decide', 'overtime_request', '769ff818-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":8,\"approved_hours\":8}', '127.0.0.1', '2026-10-31 18:53:34'),
(461, '1f4aa641-33e7-4676-8a45-09a3cf394087', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'overtime.create', 'overtime_request', '76a25f50-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"7699c5a7-d532-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-21\",\"requested_hours\":5}', '127.0.0.1', '2026-10-31 18:53:34'),
(462, 'bb6f92d3-1bce-41c0-a8fa-a035274da08e', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'overtime.decide', 'overtime_request', '76a25f50-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"rejected\",\"requested_hours\":5,\"approved_hours\":0}', '127.0.0.1', '2026-10-31 18:53:34'),
(463, '4036501d-2bc6-45db-ada5-dc0e165f51fb', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'overtime.create', 'overtime_request', '76a41c01-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"7699c5a7-d532-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-22\",\"requested_hours\":4}', '127.0.0.1', '2026-10-31 18:53:34'),
(464, 'f6261966-6bf5-4ac6-995c-5314867c3134', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '76ac8a68-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Transport 1793454812907\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 18:53:34'),
(465, '3de57897-e741-4434-89eb-651d23604c0d', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '76ad1836-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Tax 1793454812907\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 18:53:34'),
(466, '4d58f4bf-14ac-4234-aa62-e4a445b2c1e8', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'salary_component.create', 'salary_component', '76adcb98-d532-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Rent 1793454812907\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 18:53:34'),
(467, 'd739e72a-3900-41af-9636-c411f53ab5ed', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.assign', 'employee', '76a6e7e7-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":71,\"name\":\"FullChain Transport 1793454812907\",\"amount\":5000}', '127.0.0.1', '2026-10-31 18:53:34'),
(468, '71e0017e-5ed7-4bfd-ac13-3dd811b7d24e', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.assign', 'employee', '76a6e7e7-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":72,\"name\":\"FullChain Tax 1793454812907\",\"amount\":1000}', '127.0.0.1', '2026-10-31 18:53:34'),
(469, '4c1f3a7b-0336-4acf-be69-4deec25d2dd6', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'employee_salary_component.assign', 'employee', '76a6e7e7-d532-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":73,\"name\":\"FullChain Rent 1793454812907\",\"amount\":10}', '127.0.0.1', '2026-10-31 18:53:34'),
(470, 'fec58c03-8c22-4b7f-981c-b66f4893eddc', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'overtime.create', 'overtime_request', '76b066e1-d532-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"76a6e7e7-d532-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":6}', '127.0.0.1', '2026-10-31 18:53:34'),
(471, '8344322d-f88a-4f0b-98a3-0940f5dcfaac', 'user', 169, 'Payroll Admin 1793454812907', 'org_admin', 'overtime.decide', 'overtime_request', '76b066e1-d532-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":6,\"approved_hours\":6}', '127.0.0.1', '2026-10-31 18:53:34'),
(472, '34bf0da3-b8d6-4ee5-9ab7-aa2375ab0fdf', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', '9fb50072-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"Transport 1793455312276\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 19:01:52'),
(473, '2d8a05b1-db01-4a17-8dfe-4f8f65caf264', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', '9fbb3779-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"Tax 1793455312276\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 19:01:52'),
(474, 'df664102-9d82-4ff9-b9a9-05c4e58968b6', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', '9fbe3fa9-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"House Rent 1793455312276\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 19:01:52'),
(475, 'add93070-958a-4d4f-98f2-af31dd972a8e', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.assign', 'employee', '9fab22d3-d533-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":74,\"name\":\"Transport 1793455312276\",\"amount\":5000}', '127.0.0.1', '2026-10-31 19:01:52'),
(476, 'bbac0a73-1787-4e69-83cb-b7237efe8549', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.assign', 'employee', '9fab22d3-d533-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":75,\"name\":\"Tax 1793455312276\",\"amount\":1000}', '127.0.0.1', '2026-10-31 19:01:52'),
(477, '965d8bb4-66ac-4429-8ac3-7c25963aa011', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.assign', 'employee', '9fab22d3-d533-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":76,\"name\":\"House Rent 1793455312276\",\"amount\":10}', '127.0.0.1', '2026-10-31 19:01:52'),
(478, '9326e3cd-832a-4d5a-a466-a1dbe3fc6c6b', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', '9fdfc7b6-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"Mobile Allowance 1793455312276\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2000.00\"}', '127.0.0.1', '2026-10-31 19:01:52'),
(479, '014136a4-5226-4cb0-94ab-44c57ab5f337', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.assign', 'employee', '9fd684fd-d533-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":77,\"name\":\"Mobile Allowance 1793455312276\",\"amount\":2000}', '127.0.0.1', '2026-10-31 19:01:52'),
(480, '02e9a293-526e-4954-ba7d-f82b7bd57415', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', '9ff12cae-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"Fuel Allowance 1793455312276\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"2500.00\"}', '127.0.0.1', '2026-10-31 19:01:52'),
(481, '6e24b4a1-b605-49a4-b8c1-89d6ccdd8904', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.assign', 'employee', '9fe7b8c5-d533-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":78,\"name\":\"Fuel Allowance 1793455312276\",\"amount\":2500}', '127.0.0.1', '2026-10-31 19:01:52'),
(482, '16bf2c86-5309-4a5a-aaa9-71271a46bfee', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.update', 'employee', '9fe7b8c5-d533-11f1-9f66-9840bb468dc0', '{\"assignment_uuid\":\"9ff1edd6-d533-11f1-9f66-9840bb468dc0\",\"name\":\"Fuel Allowance 1793455312276\",\"amount\":2500}', '127.0.0.1', '2026-10-31 19:01:52'),
(483, '070e8a79-8068-4e88-a67e-3ba8cbc39e03', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', '9fff4c07-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"Internet Allowance 1793455312276\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1800.00\"}', '127.0.0.1', '2026-10-31 19:01:52');
INSERT INTO `audit_logs` (`id`, `uuid`, `actor_type`, `actor_id`, `actor_name`, `actor_role`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `created_at`) VALUES
(484, 'fc5321c6-4c9d-4dc2-b559-cf3496230ff3', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.assign', 'employee', '9ff86c68-d533-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":79,\"name\":\"Internet Allowance 1793455312276\",\"amount\":1800}', '127.0.0.1', '2026-10-31 19:01:52'),
(485, 'ffd0bbf1-7e3a-479e-a65e-e40bc16dc513', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.status_toggle', 'salary_component', '9fff4c07-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"Internet Allowance 1793455312276\",\"type\":\"allowance\",\"is_active\":0}', '127.0.0.1', '2026-10-31 19:01:52'),
(486, 'f7e619ae-a3cd-407d-b66e-5c0c0c87efc2', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', 'a00eb84d-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"Utility Allowance 1793455312276\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 19:01:53'),
(487, '69f2b113-692e-4840-a968-918ce11d3e9c', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.assign', 'employee', 'a006cd49-d533-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":80,\"name\":\"Utility Allowance 1793455312276\",\"amount\":1000}', '127.0.0.1', '2026-10-31 19:01:53'),
(488, '700d45d8-0329-4ac7-b8b1-03dd04b8f747', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.update', 'employee', 'a006cd49-d533-11f1-9f66-9840bb468dc0', '{\"assignment_uuid\":\"a00f8cb2-d533-11f1-9f66-9840bb468dc0\",\"name\":\"Utility Allowance 1793455312276\",\"amount\":4500}', '127.0.0.1', '2026-10-31 19:01:53'),
(489, 'a91d5b61-f3b1-4c73-ae81-3a43ccbea841', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', 'a013bbf9-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"Filter Allowance 1793455312276\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 19:01:53'),
(490, '68b5a8d5-e53e-45da-9843-f6a8c331de8b', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', 'a014c082-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"Other Tenant Component 1793455312276\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"1.00\"}', '127.0.0.1', '2026-10-31 19:01:53'),
(491, 'ef062864-5b40-4f84-ad11-6b55f01d3dea', 'user', 199, 'RejectedLeave 8', 'employee', 'leave.create', 'leave_request', 'a0393e09-d533-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 19:01:53'),
(492, 'e56c04b6-4d55-450d-8636-b06852254dfe', 'user', 200, 'InsufficientLeave 9', 'employee', 'leave.create', 'leave_request', 'a06873cc-d533-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":2,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-07\"}', '::1', '2026-10-31 19:01:53'),
(493, '40595a93-8f21-48e0-abff-73f147252b37', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'leave.reject', 'leave_request', 'a06873cc-d533-11f1-9f66-9840bb468dc0', '{\"status\":\"rejected\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":null}', '127.0.0.1', '2026-10-31 19:01:53'),
(494, '723102b2-7daf-4dd3-9d71-497773567864', 'user', 202, 'PaidLeaveFlow 11', 'employee', 'leave.create', 'leave_request', 'a07b438f-d533-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Sick Leave\",\"days\":1,\"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-12\"}', '::1', '2026-10-31 19:01:53'),
(495, '28319b7f-f872-4338-9491-ae2b1b0a4861', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'leave.approve', 'leave_request', 'a07b438f-d533-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":\"unpaid\"}', '127.0.0.1', '2026-10-31 19:01:53'),
(496, 'd6fd9d81-3163-43c8-833f-c52337a97806', 'user', 203, 'AllocationEdit 12', 'employee', 'leave.create', 'leave_request', 'a0920699-d533-11f1-9f66-9840bb468dc0', '{\"leave_type\":\"Unpaid Leave\",\"days\":1,\"start_date\":\"2026-10-06\",\"end_date\":\"2026-10-06\"}', '::1', '2026-10-31 19:01:53'),
(497, 'cc6b658b-8ba8-491e-831e-3a13e70530bc', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'leave.approve', 'leave_request', 'a0920699-d533-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_treatment\":\"unpaid\",\"approved_treatment\":\"unpaid\"}', '127.0.0.1', '2026-10-31 19:01:53'),
(498, 'e282beca-7bd5-4474-9876-7a7fc0ae41c1', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'leave_allocation.set', 'employee_leave_allocation', '93', '{\"employee_uuid\":\"a08580a4-d533-11f1-9f66-9840bb468dc0\",\"leave_type_id\":29,\"year\":2026,\"allocated_days\":8}', '127.0.0.1', '2026-10-31 19:01:53'),
(499, 'a05d741e-4d35-465a-94dd-3fdb7eab62c4', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'attendance.manual_entry', 'attendance_record', 'a09b2683-d533-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"a09866ce-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-05\",\"check_in_time\":\"08:55\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 19:01:53'),
(500, '749a3f1d-bbd5-4348-9a5e-f6338fc89204', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'attendance.manual_entry', 'attendance_record', 'a09e2927-d533-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"a09866ce-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-06\",\"check_in_time\":\"09:45\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 19:01:54'),
(501, 'a31f2f77-d40d-4b85-a701-01ac51b6ad90', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'attendance.manual_entry', 'attendance_record', 'a09f8e92-d533-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"a09866ce-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-07\",\"check_in_time\":\"10:15\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 19:01:54'),
(502, '0e35c7c3-e034-4ef1-aabd-3d77ca37a6c3', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'attendance.manual_entry', 'attendance_record', 'a0a06411-d533-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"a09866ce-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceFlow 13\",\"date\":\"2026-10-08\",\"check_in_time\":\"11:30\",\"check_out_time\":null,\"reason\":\"Biometric device offline\"}', '127.0.0.1', '2026-10-31 19:01:54'),
(503, '49bc11ea-e8a5-4829-88d7-0a61d5ebee74', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'attendance.manual_entry', 'attendance_record', 'a0a44351-d533-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"a0a3618a-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"WeekendEntry 14\",\"date\":\"2026-10-03\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"Weekend cover\"}', '127.0.0.1', '2026-10-31 19:01:54'),
(504, '5cb1a56e-397d-49a7-8399-53eb8549f034', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'attendance.manual_entry', 'attendance_record', 'a0a7adcf-d533-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"a0a6e0a0-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"AttendanceValidation 15\",\"date\":\"2026-10-05\",\"check_in_time\":\"09:00\",\"check_out_time\":null,\"reason\":\"First entry\"}', '127.0.0.1', '2026-10-31 19:01:54'),
(505, 'e8b8ba90-be33-4d18-8213-b9aea104dd53', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'attendance.ip_add', 'organization', '92', '{\"ip\":\"10.90.90.90\"}', '127.0.0.1', '2026-10-31 19:01:54'),
(506, '1d34f554-fefb-44ff-8310-e0bfa6b2f66e', 'user', 207, 'SelfAttendance 16', 'employee', 'attendance.check_in', 'attendance_record', 'a0ad73be-d533-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 19:01:54'),
(507, 'd4743b62-5370-4d32-be6d-ebe571e1fee8', 'user', 207, 'SelfAttendance 16', 'employee', 'attendance.check_out', 'attendance_record', 'a0ad73be-d533-11f1-9f66-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-10-31 19:01:54'),
(508, '70282abf-acce-4212-87f3-cf118d484c0e', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'overtime.create', 'overtime_request', 'a0c3d92c-d533-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"a0b27b20-d533-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":8}', '127.0.0.1', '2026-10-31 19:01:54'),
(509, '414d762b-d69b-4fc0-b5c2-1c853e760dc9', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'overtime.decide', 'overtime_request', 'a0c3d92c-d533-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":8,\"approved_hours\":8}', '127.0.0.1', '2026-10-31 19:01:54'),
(510, '128e1210-4514-4560-9e97-953343cde159', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'overtime.create', 'overtime_request', 'a0e69353-d533-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"a0b27b20-d533-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-21\",\"requested_hours\":5}', '127.0.0.1', '2026-10-31 19:01:54'),
(511, '643ed275-8f98-48bd-84ee-889c643de54b', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'overtime.decide', 'overtime_request', 'a0e69353-d533-11f1-9f66-9840bb468dc0', '{\"status\":\"rejected\",\"requested_hours\":5,\"approved_hours\":0}', '127.0.0.1', '2026-10-31 19:01:54'),
(512, 'a671869c-4495-4017-920b-77d6ae9c4173', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'overtime.create', 'overtime_request', 'a0e9077a-d533-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"a0b27b20-d533-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-22\",\"requested_hours\":4}', '127.0.0.1', '2026-10-31 19:01:54'),
(513, '3f221204-d0a3-4c7e-b5b2-93a6ca647e69', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', 'a1141e7e-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Transport 1793455312276\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"5000.00\"}', '127.0.0.1', '2026-10-31 19:01:54'),
(514, '790fd36e-4671-4ded-8c6a-a0e66425b019', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', 'a1153489-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Tax 1793455312276\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"1000.00\"}', '127.0.0.1', '2026-10-31 19:01:54'),
(515, '3c55b5ed-9939-4587-b7fe-69d0ab3096ce', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'salary_component.create', 'salary_component', 'a1163220-d533-11f1-9f66-9840bb468dc0', '{\"name\":\"FullChain Rent 1793455312276\",\"type\":\"allowance\",\"is_percentage\":1,\"default_value\":\"10.00\"}', '127.0.0.1', '2026-10-31 19:01:54'),
(516, '9b6d6f4f-c019-4a19-b4da-822eb42aa77e', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.assign', 'employee', 'a0f791c6-d533-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":83,\"name\":\"FullChain Transport 1793455312276\",\"amount\":5000}', '127.0.0.1', '2026-10-31 19:01:54'),
(517, '92b5af10-1027-4190-b347-2cfc23b217b6', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.assign', 'employee', 'a0f791c6-d533-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":84,\"name\":\"FullChain Tax 1793455312276\",\"amount\":1000}', '127.0.0.1', '2026-10-31 19:01:54'),
(518, 'fe7ba5d4-8bb4-4a42-90b5-da3aab4405c6', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'employee_salary_component.assign', 'employee', 'a0f791c6-d533-11f1-9f66-9840bb468dc0', '{\"salary_component_id\":85,\"name\":\"FullChain Rent 1793455312276\",\"amount\":10}', '127.0.0.1', '2026-10-31 19:01:54'),
(519, '72154a3a-a031-4f82-b23d-c26f8ae30fde', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'overtime.create', 'overtime_request', 'a11b7f82-d533-11f1-9f66-9840bb468dc0', '{\"employee_uuid\":\"a0f791c6-d533-11f1-9f66-9840bb468dc0\",\"work_date\":\"2026-10-20\",\"requested_hours\":6}', '127.0.0.1', '2026-10-31 19:01:54'),
(520, '272fb434-9c65-4d63-97ef-031789cc0569', 'user', 192, 'Payroll Admin 1793455312276', 'org_admin', 'overtime.decide', 'overtime_request', 'a11b7f82-d533-11f1-9f66-9840bb468dc0', '{\"status\":\"approved\",\"requested_hours\":6,\"approved_hours\":6}', '127.0.0.1', '2026-10-31 19:01:54'),
(521, 'bb03ac88-fcea-4790-aeb2-5677bf7d8b40', 'user', 211, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 19:02:06'),
(522, 'd4c91c22-08c1-40c5-9d01-f56ff9a9148d', 'user', 211, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":2,\"expense_claims_paid\":2}', 'unknown', '2026-10-31 19:02:06'),
(523, '835914fc-95c6-4f9d-94ae-2af00a85cbf6', 'user', 211, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":1}', 'unknown', '2026-10-31 19:02:06'),
(524, '2f4fcd16-8389-4517-bf40-2df66498094d', 'user', 211, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":3,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 19:02:06'),
(525, '2478cad0-98fa-4a8f-b475-761d3e383252', 'user', 211, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":4,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 19:02:06'),
(526, 'fb62a02c-861d-4a57-a9b6-5cb1e3003401', 'user', 211, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":5,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 19:02:06'),
(527, 'ecc0f97f-8088-4c90-b257-3e6a68e602ea', 'user', 211, NULL, 'member', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":6,\"expense_claims_paid\":0}', 'unknown', '2026-10-31 19:02:06'),
(528, '127ba54b-4734-49f6-a353-13d24d0a0d41', 'user', 1, 'Org Admin', 'org_admin', 'employee.create', 'employee', 'aeede277-d533-11f1-9f66-9840bb468dc0', '{\"full_name\":\"Returning Person\",\"email\":\"rehire-1793455337974-1@example.com\",\"organization_id\":102,\"created_platform_user\":false,\"linked_existing_account\":false,\"email_sent\":false}', '127.0.0.1', '2026-10-31 19:02:18'),
(529, '0cc69248-ef10-46c7-9115-3679ad0c9a40', 'user', 1, 'Org Admin', 'org_admin', 'employee.create', 'employee', 'aef536e9-d533-11f1-9f66-9840bb468dc0', '{\"full_name\":\"New Employment\",\"email\":\"rehire-1793455337974-7@example.com\",\"organization_id\":102,\"created_platform_user\":false,\"linked_existing_account\":false,\"email_sent\":false}', '127.0.0.1', '2026-10-31 19:02:18'),
(530, 'f6142307-dd11-4aa3-9d81-d9fc7b0e428c', 'user', 1, 'Org Admin', 'org_admin', 'employee.create', 'employee', 'aef9c9eb-d533-11f1-9f66-9840bb468dc0', '{\"full_name\":\"Returning Person\",\"email\":\"rehire-1793455337974-9@example.com\",\"organization_id\":102,\"created_platform_user\":true,\"linked_existing_account\":true,\"email_sent\":false}', '127.0.0.1', '2026-10-31 19:02:18'),
(531, '4cffdbab-832e-488b-81fe-2a3beb7cf4ab', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', 'b76a1501-d533-11f1-9f66-9840bb468dc0', '{\"organization_id\":109,\"assignment_uuid\":\"b76d9be5-d533-11f1-9f66-9840bb468dc0\",\"employee_uuid\":\"b7670309-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"ITmvwh0ec71\"}', 'unknown', '2026-10-31 19:02:32'),
(532, '1274e1b0-c306-44be-b50a-be72bd1e0062', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', 'b77cab72-d533-11f1-9f66-9840bb468dc0', '{\"organization_id\":110,\"assignment_uuid\":\"b77d9d03-d533-11f1-9f66-9840bb468dc0\",\"employee_uuid\":\"b77b80f1-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"ITmvwh0eg13\"}', 'unknown', '2026-10-31 19:02:32'),
(533, 'e181e011-ea30-478b-a4a8-8cb1ba8ea146', 'user', NULL, NULL, NULL, 'asset.return', 'asset', 'b77cab72-d533-11f1-9f66-9840bb468dc0', '{\"organization_id\":110,\"condition\":\"good\",\"notes\":null}', 'unknown', '2026-10-31 19:02:32'),
(534, '2169aebd-5822-4902-91c0-cbf0d92f5a8f', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', 'b78c78bc-d533-11f1-9f66-9840bb468dc0', '{\"organization_id\":111,\"assignment_uuid\":\"b78d216a-d533-11f1-9f66-9840bb468dc0\",\"employee_uuid\":\"b787cd61-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"ITmvwh0eia5\"}', 'unknown', '2026-10-31 19:02:32'),
(535, '990afdd5-fcd0-4eb7-8e20-a082f75420ed', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', 'b7a7dcd9-d533-11f1-9f66-9840bb468dc0', '{\"organization_id\":114,\"assignment_uuid\":\"b7a8917b-d533-11f1-9f66-9840bb468dc0\",\"employee_uuid\":\"b7a5be74-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"ITmvwh0enq9\"}', 'unknown', '2026-10-31 19:02:32'),
(536, 'f03a8242-e52c-4097-8d11-52abe0f36302', 'user', NULL, NULL, NULL, 'asset.assign', 'asset', 'b7b7490e-d533-11f1-9f66-9840bb468dc0', '{\"organization_id\":116,\"assignment_uuid\":\"b7b7d16c-d533-11f1-9f66-9840bb468dc0\",\"employee_uuid\":\"b7b6df18-d533-11f1-9f66-9840bb468dc0\",\"employee_name\":\"ITmvwh0eqv12\"}', 'unknown', '2026-10-31 19:02:32'),
(537, '1564e135-f5ad-4137-82f2-9636cc449679', 'user', 3, 'Hadi Ali', 'employee', 'attendance.check_in', 'attendance_record', '4ba8733a-d5f1-11f1-959b-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-11-01 17:39:35'),
(538, 'ba0c1514-ad45-48e0-815d-663c8fddd964', 'user', 3, 'Hadi Ali', 'employee', 'attendance.check_out', 'attendance_record', '4ba8733a-d5f1-11f1-959b-9840bb468dc0', '{\"ip\":\"::1\"}', '::1', '2026-11-01 18:16:40'),
(539, 'bd41ad0c-a982-4d19-9fba-cef530ebfe2a', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":1}', '::1', '2026-11-01 18:37:21'),
(540, 'c4a06d3f-2fa0-4cf9-981b-b7860c1e4152', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.delete_record', 'salary_record', '87114c01-e269-4ce8-8871-6b1594054766', '{\"deleted\":1}', '::1', '2026-11-01 18:37:55'),
(541, '27f45f2b-0321-4bcd-855e-1732e60b3a77', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":0}', '::1', '2026-11-01 18:41:53'),
(542, '37bb65b1-60e8-439a-8a11-c77d08c5ea04', 'user', 1, NULL, NULL, 'expense_claim.auto_approve.refused', 'expense_claim', '4db27dd6-d8fa-468e-b2b4-6b45d9219edf', '{\"reason\":\"Auto-approval requires the approve_expenses permission, which this account does not have\"}', 'unknown', '2026-11-01 18:50:04'),
(543, '25f3822c-c929-4520-ba9b-35b4f8fced16', 'user', 3, 'Hadi Ali', 'employee', 'expense_claim.submit_self', 'expense_claim', '4db27dd6-d8fa-468e-b2b4-6b45d9219edf', '{\"amount\":3000,\"expense_date\":\"2026-11-01\",\"auto_approve_requested\":false,\"auto_approve_refusal\":\"Auto-approval requires the approve_expenses permission, which this account does not have\"}', '::1', '2026-11-01 18:50:04'),
(544, 'f932b3f7-07f3-4eec-8c4f-00682b2c06b0', 'user', 1, NULL, NULL, 'attachment.create', 'expense_claim', '4db27dd6-d8fa-468e-b2b4-6b45d9219edf', '{\"count\":1,\"category\":\"expense_receipt\"}', 'unknown', '2026-11-01 18:50:05'),
(545, 'c89faf88-0a6c-42ee-92b6-ef2fca1b7c73', 'user', 1, NULL, NULL, 'expense_claim.attachment.add', 'expense_claim', '4db27dd6-d8fa-468e-b2b4-6b45d9219edf', '{\"count\":1}', 'unknown', '2026-11-01 18:50:05'),
(546, '97594127-1ed6-41b1-b0ec-08e38c44a165', 'user', 3, 'Hadi Ali', 'employee', 'expense_claim.receipt.upload_self', 'expense_claim', '4db27dd6-d8fa-468e-b2b4-6b45d9219edf', '{\"count\":1}', '::1', '2026-11-01 18:50:05'),
(547, '4b92fa3b-c260-4029-a049-25a8267d6788', 'user', 1, 'Arbaz Ali ', 'org_admin', 'expense_claim.rejected', 'expense_claim', '4db27dd6-d8fa-468e-b2b4-6b45d9219edf', '{\"amount\":3000,\"rejection_reason\":\"this is not valid\",\"payment_mode\":\"payroll\"}', '::1', '2026-11-01 18:50:21'),
(548, '7a6a815b-6b7a-4af0-a6ab-af520d2283ff', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.delete_record', 'salary_record', 'e394975f-896a-4eda-b29e-fe8d14c1273f', '{\"deleted\":1}', '::1', '2026-11-01 18:51:39'),
(549, '1f89eb67-3b08-44b6-ab3d-ecf1698669a7', 'user', 0, NULL, NULL, 'hr_letter.create', 'hr_letter', 'e4223869-d5fb-11f1-959b-9840bb468dc0', '{\"organization_id\":1,\"letterType\":\"offer\",\"employeeUuid\":\"1ee2f46e-d46c-11f1-942b-9840bb468dc0\"}', 'unknown', '2026-11-01 18:55:26'),
(550, '7a6573ff-e509-45e3-8d21-02e092b3384c', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.generate', 'payroll', '2026-11', '{\"month\":11,\"year\":2026,\"records\":1,\"expense_claims_paid\":0}', '::1', '2026-11-01 19:03:36'),
(551, '29fa15e2-c0af-47ef-941e-09de2d070934', 'user', 1, NULL, NULL, 'expense_claim.auto_approve.refused', 'expense_claim', 'ade93218-aae4-4c72-996d-0fe2184e336c', '{\"reason\":\"Auto-approval requires the approve_expenses permission, which this account does not have\"}', 'unknown', '2026-11-01 19:16:50'),
(552, '8cd2bcd2-8a19-44bc-b8e4-327415b81536', 'user', 3, 'Hadi Ali', 'employee', 'expense_claim.submit_self', 'expense_claim', 'ade93218-aae4-4c72-996d-0fe2184e336c', '{\"amount\":1000,\"expense_date\":\"2026-11-01\",\"auto_approve_requested\":false,\"auto_approve_refusal\":\"Auto-approval requires the approve_expenses permission, which this account does not have\"}', '::1', '2026-11-01 19:16:50'),
(553, '65973633-0ba8-4832-a3a0-a5e4cdc50993', 'user', 1, 'Arbaz Ali ', 'org_admin', 'expense_claim.approved', 'expense_claim', 'ade93218-aae4-4c72-996d-0fe2184e336c', '{\"amount\":1000,\"rejection_reason\":null,\"payment_mode\":\"payroll\"}', '::1', '2026-11-01 19:17:19'),
(554, 'adf07699-bf97-45a7-844c-0a14d0e5a886', 'user', 1, NULL, NULL, 'expense_claim.auto_approve.refused', 'expense_claim', '35251ed6-1cdf-45ad-a0f9-24762a469f3b', '{\"reason\":\"Auto-approval requires the approve_expenses permission, which this account does not have\"}', 'unknown', '2026-11-01 19:17:39'),
(555, '264bfa7b-19f6-4348-bd0d-78ac8ae926b2', 'user', 3, 'Hadi Ali', 'employee', 'expense_claim.submit_self', 'expense_claim', '35251ed6-1cdf-45ad-a0f9-24762a469f3b', '{\"amount\":2000,\"expense_date\":\"2026-11-01\",\"auto_approve_requested\":false,\"auto_approve_refusal\":\"Auto-approval requires the approve_expenses permission, which this account does not have\"}', '::1', '2026-11-01 19:17:39'),
(556, 'd8cb0a71-05e6-45d8-9845-8831a4809723', 'user', 1, 'Arbaz Ali ', 'org_admin', 'expense_claim.approved', 'expense_claim', '35251ed6-1cdf-45ad-a0f9-24762a469f3b', '{\"amount\":2000,\"rejection_reason\":null,\"payment_mode\":\"direct\"}', '::1', '2026-11-01 19:17:46'),
(557, 'f3eb13e1-6328-4061-be47-4941abf7a0cc', 'user', 0, NULL, NULL, 'asset.return', 'asset', '3365fc53-d50e-11f1-80de-9840bb468dc0', '{\"organization_id\":1,\"condition\":\"good\",\"notes\":null}', 'unknown', '2026-11-01 19:18:20'),
(558, '9c1f3236-3cf3-4354-bd15-c299a95f8522', 'user', 1, 'Arbaz Ali ', 'org_admin', 'subadmin.access_update', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '{\"full_name\":\"Tooba\",\"email\":\"toobafatima811@gmail.com\",\"feature_access\":{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":true,\"manage_assets\":true,\"manage_separation\":true,\"approve_expenses\":true,\"manage_recruitment\":true}}', '::1', '2026-11-01 20:07:42'),
(559, '289b2922-ba3f-45b9-8b14-b83073c84108', 'user', 0, NULL, NULL, 'candidate.offer.send', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"snapshot_hash\":\"1abf23d6eb9af3e63d5a14ad2e59e7bae5b2b5915317c0471769b6a6ef533323\"}', 'unknown', '2026-11-01 20:15:01'),
(560, '8c99f3c0-0ebb-42d3-892c-f47b5202aaab', 'user', 1, 'Arbaz Ali ', 'org_admin', 'candidate.offer.send', 'candidate', '619c5d63-123d-4800-9365-bafa4086a178', '{\"candidate_uuid\":\"619c5d63-123d-4800-9365-bafa4086a178\",\"status\":\"sent\",\"sent_at\":\"2026-11-01T15:15:01.522Z\"}', '::1', '2026-11-01 20:15:01'),
(561, '1d1dd632-0fac-4b0e-8246-bd43ca7c09a6', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":0}', '::1', '2026-11-01 20:20:55'),
(562, '3b88103e-3be2-433c-9916-4bb95d38d62b', 'user', 0, NULL, NULL, 'hr_letter.issue', 'hr_letter', 'e4223869-d5fb-11f1-959b-9840bb468dc0', '{\"organization_id\":1,\"referenceNo\":\"HR/2026/0003\",\"letterType\":\"offer\"}', 'unknown', '2026-11-01 20:22:42'),
(563, '5f7587c6-4493-476b-bc51-5458faac0e5f', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.delete_record', 'salary_record', 'c774c019-9011-4fb4-9841-9f37d6f86a30', '{\"deleted\":1}', '::1', '2026-11-01 20:58:16'),
(564, '0146915a-5af1-4acb-af16-5c2d034131da', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.delete_record', 'salary_record', 'f2f3de55-e330-405a-b844-69c392f26596', '{\"deleted\":1}', '::1', '2026-11-01 20:58:18'),
(565, '4c727baa-eec9-4d57-8bca-5ee2bf62fa03', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.generate', 'payroll', '2026-11', '{\"month\":11,\"year\":2026,\"records\":1,\"expense_claims_paid\":1}', '::1', '2026-11-01 20:58:45'),
(566, 'fdd0345c-3c96-4dfd-96a6-bf4deac2cf80', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.delete_record', 'salary_record', '6cd34f88-9112-4511-854b-2d0e15692c67', '{\"deleted\":1}', '::1', '2026-11-01 20:59:30'),
(567, 'd41a8feb-7064-4a05-b6dd-1c7123d8b734', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":0}', '::1', '2026-11-01 21:00:16'),
(568, 'b73f552a-e7d2-44a9-a41b-2e65e19a3d0f', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.delete_record', 'salary_record', 'cf383407-c77e-4e9b-b242-7c8972ac3c73', '{\"deleted\":1}', '::1', '2026-11-01 21:09:37'),
(569, 'a8c7a149-f8af-4ae5-af9c-fd6bb08d8cda', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":0}', '::1', '2026-11-01 21:37:22'),
(570, 'aeea395f-8cc4-49ae-93b3-e875135931a6', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":0}', '::1', '2026-11-01 21:38:40'),
(571, '1854222f-1b93-4f7e-8867-76b3254e665a', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.generate', 'payroll', '2026-11', '{\"month\":11,\"year\":2026,\"records\":1,\"expense_claims_paid\":0}', '::1', '2026-11-01 21:40:02'),
(572, '36afb18a-1348-4505-81c5-abe657355d1c', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.delete_record', 'salary_record', 'b24bfe66-0791-49af-9bdc-bc4e419ed234', '{\"deleted\":1}', '::1', '2026-11-01 21:40:16'),
(573, 'b1182574-5b84-4178-875f-ae2b7d282d43', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.monthly_variable.create', 'employee', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', '{\"label\":\"Attandance Allowance\",\"type\":\"allowance\",\"amount\":1000,\"month\":11,\"year\":2026}', '::1', '2026-11-01 22:09:52'),
(574, '2c95ecd0-6eee-4a55-9adb-347b582e1e86', 'user', 1, 'Arbaz Ali ', 'org_admin', 'employee_salary_component.remove', 'employee', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', '{\"assignment_uuid\":\"c7d52c63-d5f9-11f1-959b-9840bb468dc0\",\"name\":\"Provident Fund\"}', '::1', '2026-11-01 22:24:42'),
(575, '63763fe2-8386-4d6e-b15c-7ec8c84b5e32', 'user', 0, NULL, NULL, 'asset.retire', 'asset', '3365fc53-d50e-11f1-80de-9840bb468dc0', '{\"organization_id\":1,\"reason\":null}', 'unknown', '2026-11-01 22:25:53'),
(576, 'c0c69bb6-b4ed-4259-97ed-c4a42bd749a5', 'user', 0, NULL, NULL, 'asset.reinstate', 'asset', '3365fc53-d50e-11f1-80de-9840bb468dc0', '{\"organization_id\":1,\"status\":\"available\"}', 'unknown', '2026-11-01 22:25:57'),
(577, '46c55c50-235c-4ac0-8d34-6a9376cd187d', 'user', 1, 'Arbaz Ali ', 'org_admin', 'salary_component.create', 'salary_component', '83f950b6-d61b-11f1-959b-9840bb468dc0', '{\"name\":\"Attendance Bonus\",\"type\":\"allowance\",\"is_percentage\":0,\"default_value\":\"0.00\"}', '::1', '2026-11-01 22:41:37'),
(578, 'f4fe5fef-17c1-482f-b04f-4eb0b8136db9', 'user', 1, 'Arbaz Ali ', 'org_admin', 'salary_component.create', 'salary_component', '8aaed3d8-d61b-11f1-959b-9840bb468dc0', '{\"name\":\"Late Coming Deduction\",\"type\":\"deduction\",\"is_percentage\":0,\"default_value\":\"0.00\"}', '::1', '2026-11-01 22:41:48'),
(579, 'df13c9b7-3900-414b-a5bb-84e2ab4b8436', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.monthly_variable.delete', 'employee', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', '{\"variable_uuid\":\"14c583c4-d617-11f1-959b-9840bb468dc0\"}', '::1', '2026-11-01 22:48:48'),
(580, 'd9daa550-3e21-4e87-ae78-afddfebd40ea', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.monthly_variable.create', 'employee', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', '{\"label\":\"Attendance Bonus\",\"type\":\"allowance\",\"amount\":1000,\"month\":11,\"year\":2026}', '::1', '2026-11-01 22:49:07'),
(581, '972dff11-803f-4714-a1e7-9097884f33bc', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.monthly_variable.update', 'employee', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', '{\"variable_uuid\":\"909ea8c6-d61c-11f1-959b-9840bb468dc0\",\"before\":{\"label\":\"Attendance Bonus\",\"type\":\"allowance\",\"amount\":1000,\"month\":11,\"year\":2026},\"after\":{\"label\":\"Attendance Bonus\",\"type\":\"allowance\",\"amount\":1000,\"month\":10,\"year\":2026}}', '::1', '2026-11-01 22:49:26'),
(582, 'a85fc4ae-a8fa-489f-8081-240856b17082', 'user', 0, NULL, NULL, 'letter_template.update', 'hr_letter', '67015b8f-623d-44bc-9f7e-284f5f75d82b', '{\"organization_id\":1,\"letterType\":\"offer\"}', 'unknown', '2026-11-01 22:53:52'),
(583, 'c8efd82e-c8d4-46c6-87fd-b33d4ecef60d', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.delete_record', 'salary_record', '07625d58-142b-4235-b826-87c601a2991c', '{\"deleted\":1}', '::1', '2026-11-01 23:00:09'),
(584, '72e8999c-84c6-443d-9fd9-833e02bfe4e7', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.generate', 'payroll', '2026-10', '{\"month\":10,\"year\":2026,\"records\":1,\"expense_claims_paid\":0}', '::1', '2026-11-01 23:00:39'),
(585, '1d832500-c65a-4b2e-af4f-5771a9a6925a', 'user', 0, NULL, NULL, 'hr_letter.create', 'hr_letter', 'b0fff0f9-d61e-11f1-959b-9840bb468dc0', '{\"organization_id\":1,\"letterType\":\"offer\",\"employeeUuid\":\"1ee2f46e-d46c-11f1-942b-9840bb468dc0\"}', 'unknown', '2026-11-01 23:04:21'),
(586, '2614af9f-65a9-47bd-a85b-8458a4ef3d8a', 'user', 0, NULL, NULL, 'hr_letter.issue', 'hr_letter', 'b0fff0f9-d61e-11f1-959b-9840bb468dc0', '{\"organization_id\":1,\"referenceNo\":\"HR/2026/0004\",\"letterType\":\"offer\"}', 'unknown', '2026-11-01 23:04:26'),
(587, '312cc5db-e793-4c2e-a789-3204f5e0ee16', 'user', 1, 'Arbaz Ali ', 'org_admin', 'exit_request.create', 'exit_request', '37441858-20db-4b0f-986d-c1590de1c3d4', '{\"employee_uuid\":\"86207d91-b251-46ed-a998-3b36cba9f939\",\"request_type\":\"termination\",\"last_working_day\":\"2026-11-02\"}', '::1', '2026-11-02 16:09:49'),
(588, 'ae2dcb4e-0049-4317-b3a9-6b4ba67e1292', 'user', 1, 'Arbaz Ali ', 'org_admin', 'exit_request.approved', 'exit_request', '37441858-20db-4b0f-986d-c1590de1c3d4', '{\"last_working_day\":\"2026-11-02\",\"days_until_last_working_day\":0}', '::1', '2026-11-02 16:10:33'),
(589, '025de2c6-4b43-4e3a-8deb-2719bd8a08e5', 'user', 1, 'Arbaz Ali ', 'org_admin', 'exit_request.complete', 'exit_request', '37441858-20db-4b0f-986d-c1590de1c3d4', '{\"employee_uuid\":\"86207d91-b251-46ed-a998-3b36cba9f939\",\"employee_name\":\"M JUNAID SHAHID\"}', '::1', '2026-11-02 16:10:42'),
(590, 'e1cc6cb9-3543-4f16-bfb1-bee231946252', 'user', 0, NULL, NULL, 'hr_letter.create', 'hr_letter', 'b61c8d05-d6b2-11f1-9a5e-9840bb468dc0', '{\"organization_id\":1,\"letterType\":\"offer\",\"employeeUuid\":\"1ee2f46e-d46c-11f1-942b-9840bb468dc0\"}', 'unknown', '2026-11-02 16:44:05'),
(591, '4f5b1b57-538b-4654-bb5b-4e4c689367e3', 'user', 0, NULL, NULL, 'hr_letter.issue', 'hr_letter', 'b61c8d05-d6b2-11f1-9a5e-9840bb468dc0', '{\"organization_id\":1,\"referenceNo\":\"HR/2026/0005\",\"letterType\":\"offer\"}', 'unknown', '2026-11-02 16:44:10'),
(592, '09491026-f2c1-4bd3-af8b-f38c58e8182c', 'user', 0, NULL, NULL, 'hr_letter.create', 'hr_letter', 'c1edc673-d6b2-11f1-9a5e-9840bb468dc0', '{\"organization_id\":1,\"letterType\":\"offer\",\"employeeUuid\":\"1ee2f46e-d46c-11f1-942b-9840bb468dc0\"}', 'unknown', '2026-11-02 16:44:25'),
(593, '44415fc7-b4fa-41a5-bab2-2827611418e6', 'user', 0, NULL, NULL, 'hr_letter.delete', 'hr_letter', 'c1edc673-d6b2-11f1-9a5e-9840bb468dc0', '{\"organization_id\":1}', 'unknown', '2026-11-02 17:24:34'),
(594, '4df7bca1-5766-4eae-9cb7-08d04a905096', 'user', 0, NULL, NULL, 'asset.assign', 'asset', '3365fc53-d50e-11f1-80de-9840bb468dc0', '{\"organization_id\":1,\"assignment_uuid\":\"584377d0-d6bf-11f1-9a5e-9840bb468dc0\",\"employee_uuid\":\"1ee2f46e-d46c-11f1-942b-9840bb468dc0\",\"employee_name\":\"Hadi Ali\"}', 'unknown', '2026-11-02 18:14:31'),
(595, '2797fd7b-eec2-4fea-8157-cb372bec23c2', 'user', 1, 'Arbaz Ali ', 'org_admin', 'payroll.delete_record', 'salary_record', '3f4de6ec-d9be-49b2-aa70-dc68dbc71b6c', '{\"deleted\":1}', '::1', '2026-11-02 19:29:41'),
(596, '37627a37-da4d-43af-a857-9bc4d5c06794', 'user', 1, 'Arbaz Ali', 'org_admin', 'employee.update', 'employee', '1e15125b-5da9-40c8-acfb-19bb963dff7e', '{\"employee_code\":\"EMP-000003\",\"employee_name\":\"Testing hunain\",\"changes\":{\"joining_date\":{\"from\":\"2026-10-28\",\"to\":\"2026-09-29\"}},\"source\":\"database maintenance\"}', 'local-db', '2026-11-02 20:11:11'),
(597, 'a549daa0-4006-400a-9a15-69fa3c599dbd', 'user', 1, 'Arbaz Ali', 'org_admin', 'attendance.manual_entry', 'attendance_record', '1e15125b-5da9-40c8-acfb-19bb963dff7e', '{\"employee_code\":\"EMP-000003\",\"employee_name\":\"Testing hunain\",\"month\":\"2026-10\",\"dates\":[\"2026-10-01\",\"2026-10-02\",\"2026-10-05\",\"2026-10-06\",\"2026-10-07\",\"2026-10-08\",\"2026-10-09\",\"2026-10-12\",\"2026-10-13\",\"2026-10-14\",\"2026-10-15\",\"2026-10-16\",\"2026-10-19\",\"2026-10-20\",\"2026-10-21\",\"2026-10-22\",\"2026-10-23\",\"2026-10-26\",\"2026-10-27\",\"2026-10-28\",\"2026-10-29\",\"2026-10-30\"],\"count\":22,\"check_in_time\":\"09:00\",\"check_out_time\":\"17:00\",\"reason\":\"Testing karna ha payroll\",\"source\":\"database maintenance\"}', 'local-db', '2026-11-02 20:11:11');

-- --------------------------------------------------------

--
-- Table structure for table `candidates`
--

CREATE TABLE `candidates` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `job_opening_uuid` char(36) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `cnic` varchar(20) DEFAULT NULL,
  `resume_attachment_uuid` char(36) DEFAULT NULL,
  `cover_letter` text DEFAULT NULL,
  `stage` enum('applied','screening','interview','selected','offered','hired','declined','rejected') NOT NULL DEFAULT 'applied',
  `rating` decimal(3,2) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `rejected_reason` varchar(500) DEFAULT NULL,
  `converted_employee_uuid` char(36) DEFAULT NULL,
  `offer_letter_uuid` char(36) DEFAULT NULL,
  `offer_status` enum('ready','sent','hired') DEFAULT NULL,
  `offer_sent_at` datetime DEFAULT NULL,
  `offer_response_at` datetime DEFAULT NULL,
  `offer_response_notes` varchar(1000) DEFAULT NULL,
  `failed_interview_override_reason` varchar(1000) DEFAULT NULL,
  `failed_interview_override_by_uuid` char(36) DEFAULT NULL,
  `failed_interview_override_at` datetime DEFAULT NULL,
  `offer_template_uuid` char(36) DEFAULT NULL,
  `offer_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`offer_values`)),
  `offer_body_snapshot` mediumtext DEFAULT NULL,
  `offer_snapshot_hash` char(64) DEFAULT NULL,
  `offer_snapshot_at` datetime DEFAULT NULL,
  `offer_template_hash` char(64) DEFAULT NULL,
  `hired_at` datetime DEFAULT NULL,
  `converted_at` datetime DEFAULT NULL,
  `created_by_uuid` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `candidates`
--

INSERT INTO `candidates` (`id`, `uuid`, `organization_id`, `job_opening_uuid`, `full_name`, `email`, `phone`, `cnic`, `resume_attachment_uuid`, `cover_letter`, `stage`, `rating`, `notes`, `rejected_reason`, `converted_employee_uuid`, `offer_letter_uuid`, `offer_status`, `offer_sent_at`, `offer_response_at`, `offer_response_notes`, `failed_interview_override_reason`, `failed_interview_override_by_uuid`, `failed_interview_override_at`, `offer_template_uuid`, `offer_values`, `offer_body_snapshot`, `offer_snapshot_hash`, `offer_snapshot_at`, `offer_template_hash`, `hired_at`, `converted_at`, `created_by_uuid`, `created_at`, `updated_at`) VALUES
(1, '619c5d63-123d-4800-9365-bafa4086a178', 1, '81fe80d1-7e9b-4b3c-b393-b6ee148bd205', 'HUNAIN HAIDER', 'hunainhaider811@gmail.com', '+92 318 248 4396', NULL, '7dca5382-6c58-4008-ae65-b0e6f4d29434', 'Dear Hiring Team,\n\nI am writing to apply for the Developer position. Please find my CV attached for your consideration; it outlines my background and qualifications.\n\nI would welcome the opportunity to discuss how my experience and skills may fit the needs of this role. Thank you for your time and consideration.\n\nSincerely,\nHUNAIN HAIDER', 'offered', NULL, NULL, NULL, NULL, NULL, 'sent', '2026-11-01 20:15:01', NULL, NULL, NULL, NULL, NULL, '67015b8f-623d-44bc-9f7e-284f5f75d82b', '{\"employee_name\":\"HUNAIN HAIDER\",\"designation\":\"Manager\",\"department\":\"HR\",\"joining_date\":\"2026-11-01\",\"cnic\":\"4250187382878\",\"organization_name\":\"HakamTechSOl\",\"issue_date\":\"2026-10-30\",\"letter_date\":\"2026-10-30\",\"reference_no\":\"OFR-619C5D63\",\"new_salary\":\"200000\"}', 'Date: 30-Oct-2026\n\nRef No: OFR-619C5D63\n\nTo,\n\nHUNAIN HAIDER\n\nCNIC: 4250187382878\n\nSubject: Offer of Employment - Manager\n\nDear HUNAIN HAIDER,\n\nHumaray paas aap ke liye khushkhabri hai! HakamTechSOl aap ko Manager ki position offer karte hue behad khushi mehsus kar raha hai. Aap ki appointment HR department me hogi.\n\nAap ki joining aur compensation ki Tafseelat (Details) neeche darj hain:\n\nDesignation: Manager\n\nDepartment: HR\n\nDate of Joining: 01-Nov-2026\n\nCurrent / Base Salary: 200000\n\nIssue Date: 30-Oct-2026\n\n(Note: Direct compensation 01-Nov-2026 se lagu hogi aur payroll organization ki currency aur pay-frequency policy ke mutabiq manage kiya jaye ga.)\n\nAap ko jald hi ek detailed Employment Contract bheja jaye ga jis me terms & conditions, benefits, aur company policies ki mukammal tafseelat hongi.\n\nKharaye-karam is offer letter ko sign karke accept karein aur humein wapas send karein taake aap ka onboarding process shuru kiya ja sakay.\n\nHum aap ko HakamTechSOl ki team me welcome karne ke liye pur-josh hain!\n\nSincerely,\n\nHuman Resources Department\n\nHakamTechSOl\n\nAcceptance of Offer:\n\nMain is Offer Letter ki tamaam terms aur conditions ko samajhta/samajhti hoon aur is employment offer ko qabool karta/karti hoon.', '1abf23d6eb9af3e63d5a14ad2e59e7bae5b2b5915317c0471769b6a6ef533323', '2026-10-30 20:50:43', 'c45d44982ad6a28d939eb07c43f67630c166d6e6cb79fceee9dd43b65091a4b2', NULL, NULL, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 20:36:13', '2026-11-01 20:15:01'),
(2, 'a69f4063-2603-4943-b0fc-5f4aac92d555', 1, '81fe80d1-7e9b-4b3c-b393-b6ee148bd205', 'Testing hunain', 'hunainhaider5522@gmail.com', '03182484922', '4250153637372', NULL, NULL, 'hired', NULL, NULL, NULL, '1e15125b-5da9-40c8-acfb-19bb963dff7e', NULL, 'hired', '2026-10-30 22:13:17', '2026-10-30 22:13:23', NULL, NULL, NULL, NULL, '67015b8f-623d-44bc-9f7e-284f5f75d82b', '{\"employee_name\":\"Testing hunain\",\"designation\":\"Manager\",\"department\":\"HR\",\"joining_date\":\"2026-10-28\",\"cnic\":\"4250153637372\",\"organization_name\":\"HakamTechSOl\",\"issue_date\":\"2026-10-30\",\"letter_date\":\"2026-10-30\",\"reference_no\":\"OFR-A69F4063\",\"new_salary\":\"2000\"}', 'Date: 30-Oct-2026\n\nRef No: OFR-A69F4063\n\nTo,\n\nTesting hunain\n\nCNIC: 4250153637372\n\nSubject: Offer of Employment - Manager\n\nDear Testing hunain,\n\nHumaray paas aap ke liye khushkhabri hai! HakamTechSOl aap ko Manager ki position offer karte hue behad khushi mehsus kar raha hai. Aap ki appointment HR department me hogi.\n\nAap ki joining aur compensation ki Tafseelat (Details) neeche darj hain:\n\nDesignation: Manager\n\nDepartment: HR\n\nDate of Joining: 28-Oct-2026\n\nCurrent / Base Salary: 2000\n\nIssue Date: 30-Oct-2026\n\n(Note: Direct compensation 28-Oct-2026 se lagu hogi aur payroll organization ki currency aur pay-frequency policy ke mutabiq manage kiya jaye ga.)\n\nAap ko jald hi ek detailed Employment Contract bheja jaye ga jis me terms & conditions, benefits, aur company policies ki mukammal tafseelat hongi.\n\nKharaye-karam is offer letter ko sign karke accept karein aur humein wapas send karein taake aap ka onboarding process shuru kiya ja sakay.\n\nHum aap ko HakamTechSOl ki team me welcome karne ke liye pur-josh hain!\n\nSincerely,\n\nHuman Resources Department\n\nHakamTechSOl\n\nAcceptance of Offer:\n\nMain is Offer Letter ki tamaam terms aur conditions ko samajhta/samajhti hoon aur is employment offer ko qabool karta/karti hoon.', '0c0f288c45d152e0058e5d4b1501da35bbd6df427c7bde789dd185a46bf6f75f', '2026-10-30 22:13:05', 'c45d44982ad6a28d939eb07c43f67630c166d6e6cb79fceee9dd43b65091a4b2', '2026-10-30 22:13:23', '2026-10-30 22:13:23', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 21:56:40', '2026-10-30 22:13:23'),
(3, 'a5841d1f-3884-41a0-8c82-3884c864a861', 1, '81fe80d1-7e9b-4b3c-b393-b6ee148bd205', 'M JUNAID SHAHID', 'muhammadjunaidshahidofficial@gmail.com', '+92 322 1315218', '4250187382878', '7da3b218-d020-4ee8-84c0-d5f61b29cf2c', 'Dear Hiring Team,\n\nI am writing to apply for the Developer position. Please find my CV attached for your consideration; it outlines my background and qualifications.\n\nI would welcome the opportunity to discuss how my experience and skills may fit the needs of this role. Thank you for your time and consideration.\n\nSincerely,\nM JUNAID SHAHID', 'hired', NULL, NULL, NULL, '86207d91-b251-46ed-a998-3b36cba9f939', NULL, 'hired', '2026-10-30 22:36:06', '2026-10-30 22:36:10', NULL, NULL, NULL, NULL, '67015b8f-623d-44bc-9f7e-284f5f75d82b', '{\"employee_name\":\"M JUNAID SHAHID\",\"designation\":\"Manager\",\"department\":\"HR\",\"joining_date\":\"2026-11-30\",\"cnic\":\"4250187382878\",\"organization_name\":\"HakamTechSOl\",\"issue_date\":\"2026-10-30\",\"letter_date\":\"2026-10-30\",\"reference_no\":\"OFR-A5841D1F\",\"new_salary\":\"200000\"}', 'Date: 30-Oct-2026\n\nRef No: OFR-A5841D1F\n\nTo,\n\nM JUNAID SHAHID\n\nCNIC: 4250187382878\n\nSubject: Offer of Employment - Manager\n\nDear M JUNAID SHAHID,\n\nHumaray paas aap ke liye khushkhabri hai! HakamTechSOl aap ko Manager ki position offer karte hue behad khushi mehsus kar raha hai. Aap ki appointment HR department me hogi.\n\nAap ki joining aur compensation ki Tafseelat (Details) neeche darj hain:\n\nDesignation: Manager\n\nDepartment: HR\n\nDate of Joining: 30-Nov-2026\n\nCurrent / Base Salary: 200000\n\nIssue Date: 30-Oct-2026\n\n(Note: Direct compensation 30-Nov-2026 se lagu hogi aur payroll organization ki currency aur pay-frequency policy ke mutabiq manage kiya jaye ga.)\n\nAap ko jald hi ek detailed Employment Contract bheja jaye ga jis me terms & conditions, benefits, aur company policies ki mukammal tafseelat hongi.\n\nKharaye-karam is offer letter ko sign karke accept karein aur humein wapas send karein taake aap ka onboarding process shuru kiya ja sakay.\n\nHum aap ko HakamTechSOl ki team me welcome karne ke liye pur-josh hain!\n\nSincerely,\n\nHuman Resources Department\n\nHakamTechSOl\n\nAcceptance of Offer:\n\nMain is Offer Letter ki tamaam terms aur conditions ko samajhta/samajhti hoon aur is employment offer ko qabool karta/karti hoon.', 'cfd4808f7027b6b0d4d9f2d95e2f5bd84dfe3056a8476358f597db8322e251a1', '2026-10-30 22:35:55', 'c45d44982ad6a28d939eb07c43f67630c166d6e6cb79fceee9dd43b65091a4b2', '2026-10-30 22:36:10', '2026-10-30 22:36:10', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 22:34:31', '2026-10-30 22:36:10'),
(4, 'ebe376c8-ffdd-4437-a24d-52cf0b41c565', 3, '5e9d6478-bdd7-4d25-a296-21b88457b53f', 'ARBAZ ALI', 'arbu1499@gmail.com', '+92 309 2271214', NULL, 'c866ee50-ac43-4da6-9b3d-56193be1cb57', 'Dear Hiring Team,\n\nI am writing to apply for the Developer position. Please find my CV attached for your consideration; it outlines my background and qualifications.\n\nI would welcome the opportunity to discuss how my experience and skills may fit the needs of this role. Thank you for your time and consideration.\n\nSincerely,\nARBAZ ALI', 'interview', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'c344496e-d489-11f1-942b-9840bb468dc0', '2026-10-30 22:55:40', '2026-10-30 22:56:08');

-- --------------------------------------------------------

--
-- Table structure for table `contact_leads`
--

CREATE TABLE `contact_leads` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL DEFAULT uuid(),
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `message` text NOT NULL,
  `status` enum('new','contacted','closed') NOT NULL DEFAULT 'new',
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `custom_plan_requests`
--

CREATE TABLE `custom_plan_requests` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `requested_by_uuid` char(36) NOT NULL,
  `message` text DEFAULT NULL,
  `requested_quota` int(11) DEFAULT NULL,
  `requested_price` decimal(12,2) DEFAULT NULL,
  `status` enum('pending','approved','denied') NOT NULL DEFAULT 'pending',
  `approved_daily_quota` int(11) DEFAULT NULL,
  `approved_price` decimal(12,2) DEFAULT NULL,
  `approved_plan_id` int(11) DEFAULT NULL COMMENT 'The subscription_plans row created by this approval; NULL means no plan is linked to this request',
  `decided_by` char(36) DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `custom_plan_requests`
--
DELIMITER $$
CREATE TRIGGER `bi_custom_plan_requests_uuid` BEFORE INSERT ON `custom_plan_requests` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `daily_request_usage`
--

CREATE TABLE `daily_request_usage` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `date` date NOT NULL,
  `requests_used` int(11) NOT NULL DEFAULT 0,
  `total_requests` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `daily_request_usage`
--

INSERT INTO `daily_request_usage` (`id`, `organization_id`, `date`, `requests_used`, `total_requests`, `created_at`, `updated_at`) VALUES
(1, 1, '2026-10-30', 2, 2, '2026-10-30 19:37:44', '2026-10-30 19:43:32'),
(4, 2, '2026-10-30', 1, 1, '2026-10-30 19:44:34', '2026-10-30 19:44:34');

-- --------------------------------------------------------

--
-- Table structure for table `departments`
--

CREATE TABLE `departments` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(100) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `departments`
--

INSERT INTO `departments` (`id`, `uuid`, `organization_id`, `name`, `created_at`) VALUES
(1, '70f2938b-d46b-11f1-942b-9840bb468dc0', 2, 'IT', '2026-10-30 19:08:55'),
(2, '0901f05b-d46c-11f1-942b-9840bb468dc0', 1, 'IT', '2026-10-30 19:13:10'),
(3, 'c220b13f-d475-11f1-942b-9840bb468dc0', 1, 'HR', '2026-10-30 20:22:46'),
(4, 'fa75752b-d48a-11f1-942b-9840bb468dc0', 3, 'IT', '2026-10-30 22:54:40');

--
-- Triggers `departments`
--
DELIMITER $$
CREATE TRIGGER `bi_departments_uuid` BEFORE INSERT ON `departments` FOR EACH ROW BEGIN
  IF NEW.uuid IS NULL OR NEW.uuid = '' THEN
    SET NEW.uuid = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `designations`
--

CREATE TABLE `designations` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(100) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `designations`
--

INSERT INTO `designations` (`id`, `uuid`, `organization_id`, `name`, `created_at`) VALUES
(1, '6bc0e7b3-d46b-11f1-942b-9840bb468dc0', 2, 'Team Lead', '2026-10-30 19:08:46'),
(2, 'ffb2e9f1-d46b-11f1-942b-9840bb468dc0', 1, 'Manager', '2026-10-30 19:12:55'),
(3, '014d80d6-d48b-11f1-942b-9840bb468dc0', 3, 'Java Developer', '2026-10-30 22:54:52');

--
-- Triggers `designations`
--
DELIMITER $$
CREATE TRIGGER `bi_designations_uuid` BEFORE INSERT ON `designations` FOR EACH ROW BEGIN
  IF NEW.uuid IS NULL OR NEW.uuid = '' THEN
    SET NEW.uuid = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `designation_leave_policies`
--

CREATE TABLE `designation_leave_policies` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `designation_id` int(11) NOT NULL,
  `leave_type_id` bigint(20) UNSIGNED NOT NULL,
  `year` smallint(5) UNSIGNED NOT NULL,
  `allocated_days` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `designation_leave_policies`
--

INSERT INTO `designation_leave_policies` (`id`, `uuid`, `organization_id`, `designation_id`, `leave_type_id`, `year`, `allocated_days`, `created_at`, `updated_at`) VALUES
(1, 'd0676741-d470-11f1-942b-9840bb468dc0', 1, 2, 2, 2026, 20, '2026-10-30 19:47:23', '2026-10-30 19:47:23'),
(2, 'd30aa5c8-d470-11f1-942b-9840bb468dc0', 1, 2, 1, 2026, 20, '2026-10-30 19:47:27', '2026-10-30 19:47:27');

-- --------------------------------------------------------

--
-- Table structure for table `document_types`
--

CREATE TABLE `document_types` (
  `id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `label_key` varchar(150) NOT NULL,
  `schema_key` varchar(50) NOT NULL DEFAULT 'generic',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `description` varchar(255) DEFAULT NULL,
  `created_by` varchar(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `document_types`
--

INSERT INTO `document_types` (`id`, `name`, `label_key`, `schema_key`, `is_active`, `sort_order`, `description`, `created_by`, `created_at`, `updated_at`) VALUES
(1, 'CNIC / National ID Copy', 'cnic national id copy', 'cnic', 1, 1, NULL, NULL, '2026-09-28 11:16:09', '2026-10-17 17:18:02'),
(2, 'Passport ', 'passport ', 'passport', 1, 2, NULL, NULL, '2026-09-28 11:16:09', '2026-10-17 17:18:06'),
(3, 'Experience Certificate', 'experience certificate', 'experience_letter', 1, 3, NULL, NULL, '2026-09-28 11:16:09', '2026-10-17 17:18:08'),
(4, 'Recommendation Letter', 'recommendation letter', 'recommendation_letters', 1, 4, NULL, NULL, '2026-09-29 10:56:02', '2026-10-17 17:18:12'),
(5, 'Employee Card', 'employee\ncard', 'employee_id', 1, 5, NULL, NULL, '2026-09-28 11:16:09', '2026-10-17 17:18:14'),
(6, 'Promotion Letter', 'promotion letter', 'promotion_letter', 1, 6, NULL, NULL, '2026-09-28 11:16:09', '2026-10-17 17:18:16'),
(7, 'Increment Letter', 'increment letter', 'increment_letter', 1, 7, NULL, NULL, '2026-09-28 11:16:09', '2026-10-17 17:18:18'),
(8, 'Resignation Letter', 'resignation letter', 'resignation_letter', 1, 8, NULL, NULL, '2026-09-28 11:16:09', '2026-10-17 17:18:21'),
(9, 'Relieving Letter', 'relieving letter', 'relieving_letter', 1, 9, NULL, NULL, '2026-09-28 11:16:09', '2026-10-17 17:18:23'),
(46, 'CV/Resume', 'cv resume', 'generic', 1, 10, NULL, 'b16014ca-9bc5-11f1-a28a-9840bb468dc0', '2026-10-30 14:10:10', '2026-10-30 14:10:10');

-- --------------------------------------------------------

--
-- Table structure for table `email_outbox`
--

CREATE TABLE `email_outbox` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `event_key` varchar(255) NOT NULL,
  `user_uuid` char(36) DEFAULT NULL,
  `recipient_email` varchar(190) NOT NULL,
  `category` enum('leave','support','recruitment','payroll','attendance','onboarding','system') NOT NULL,
  `language` enum('en','ur') NOT NULL DEFAULT 'en',
  `subject` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `action_url` varchar(1000) DEFAULT NULL,
  `status` enum('pending','sending','sent','failed') NOT NULL DEFAULT 'pending',
  `attempts` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `available_at` datetime NOT NULL DEFAULT current_timestamp(),
  `claimed_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `last_error` varchar(1000) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `email_outbox`
--

INSERT INTO `email_outbox` (`id`, `event_key`, `user_uuid`, `recipient_email`, `category`, `language`, `subject`, `title`, `message`, `action_url`, `status`, `attempts`, `available_at`, `claimed_at`, `sent_at`, `last_error`, `created_at`) VALUES
(1, 'leave:f531607a-d470-11f1-942b-9840bb468dc0:submitted:c5f55cb3-d462-11f1-942b-9840bb468dc0', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'hunainhaider5566@gmail.com', 'leave', 'en', 'Leave request needs review — Hadi Ali', 'New leave request', 'Hadi Ali requested 7 day(s) of Anuual leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-30 19:48:25', NULL, '2026-10-30 19:48:40', NULL, '2026-10-30 19:48:25'),
(2, 'leave:f531607a-d470-11f1-942b-9840bb468dc0:decision:approved:1f228ba4-d46c-11f1-942b-9840bb468dc0', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'hunainhaider811@gmail.com', 'leave', 'en', 'Your Anuual leave was approved', 'Leave approved', 'Your Anuual leave request (2026-10-31 to 2026-11-06) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-30 19:50:00', NULL, '2026-10-30 19:50:13', NULL, '2026-10-30 19:50:00'),
(3, 'interview:924dac4b-6d78-412a-b236-134eeba41dc2:scheduled:candidate', NULL, 'hunainhaider811@gmail.com', 'recruitment', 'en', 'Interview scheduled — Developer', 'Your interview is scheduled', 'Your interview for Developer is scheduled for 07-Oct-2026, 8:41 pm (phone).', 'http://localhost:8080/org/recruitment/interviews', 'sent', 1, '2026-10-30 20:41:59', NULL, '2026-10-30 20:42:12', NULL, '2026-10-30 20:41:59'),
(4, 'interview:924dac4b-6d78-412a-b236-134eeba41dc2:scheduled:interviewer', 'fac36eca-d475-11f1-942b-9840bb468dc0', 'testing1@gmail.com', 'recruitment', 'en', 'Interview scheduled — HUNAIN HAIDER', 'Interview added to your schedule', 'You are scheduled to interview HUNAIN HAIDER for Developer on 07-Oct-2026, 8:41 pm.', 'http://localhost:8080/org/recruitment/interviews', 'sent', 1, '2026-10-30 20:41:59', NULL, '2026-10-30 20:42:21', NULL, '2026-10-30 20:41:59'),
(5, 'interview:4ea8dc12-8232-4839-aef1-1e28b095562e:scheduled:candidate', NULL, 'hunainhaider5522@gmail.com', 'recruitment', 'en', 'Interview scheduled — Developer', 'Your interview is scheduled', 'Your interview for Developer is scheduled for 12-Oct-2026, 10:11 pm (onsite).', NULL, 'sent', 1, '2026-10-30 22:11:29', NULL, '2026-10-30 22:11:39', NULL, '2026-10-30 22:11:29'),
(6, 'interview:4ea8dc12-8232-4839-aef1-1e28b095562e:scheduled:interviewer', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'hunainhaider5566@gmail.com', 'recruitment', 'en', 'Interview scheduled — Testing hunain', 'Interview added to your schedule', 'You are scheduled to interview Testing hunain for Developer on 12-Oct-2026, 10:11 pm.', 'http://localhost:8080/my-interviews', 'sent', 1, '2026-10-30 22:11:29', NULL, '2026-10-30 22:11:39', NULL, '2026-10-30 22:11:29'),
(7, 'interview:2c5cf850-2dee-4558-ad9d-5b05a575ac74:scheduled:candidate', NULL, 'muhammadjunaidshahidofficial@gmail.com', 'recruitment', 'en', 'Interview scheduled — Developer', 'Your interview is scheduled', 'Your interview for Developer is scheduled for 31-Oct-2026, 10:34 pm (onsite).', NULL, 'sent', 1, '2026-10-30 22:35:06', NULL, '2026-10-30 22:35:16', NULL, '2026-10-30 22:35:06'),
(8, 'interview:2c5cf850-2dee-4558-ad9d-5b05a575ac74:scheduled:interviewer', '352a7686-d473-11f1-942b-9840bb468dc0', 'toobafatima811@gmail.com', 'recruitment', 'en', 'Interview scheduled — M JUNAID SHAHID', 'Interview added to your schedule', 'You are scheduled to interview M JUNAID SHAHID for Developer on 31-Oct-2026, 10:34 pm.', 'http://localhost:8080/my-interviews', 'sent', 1, '2026-10-30 22:35:06', NULL, '2026-10-30 22:35:17', NULL, '2026-10-30 22:35:06'),
(9, 'interview:2c5cf850-2dee-4558-ad9d-5b05a575ac74:reminder:24h:candidate', NULL, 'muhammadjunaidshahidofficial@gmail.com', 'recruitment', 'en', 'Interview reminder — Developer', 'Your interview is tomorrow', 'Reminder: your interview is scheduled for 31-Oct-2026, 10:34 pm (onsite).', 'http://localhost:8080/org/recruitment/interviews', 'sent', 1, '2026-10-30 22:35:10', NULL, '2026-10-30 22:35:21', NULL, '2026-10-30 22:35:10'),
(10, 'leave:9a2fd5ae-d504-11f1-80de-9840bb468dc0:submitted:99e25724-d504-11f1-80de-9840bb468dc0', '99e25724-d504-11f1-80de-9840bb468dc0', 'payroll-admin-1793435116337@example.com', 'leave', 'en', 'Leave request needs review — UnpaidLeaveFlow 7', 'New leave request', 'UnpaidLeaveFlow 7 requested 2 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 13:25:16', NULL, '2026-10-31 13:25:24', NULL, '2026-10-31 13:25:16'),
(11, 'leave:9a2fd5ae-d504-11f1-80de-9840bb468dc0:decision:approved:9a2859da-d504-11f1-80de-9840bb468dc0', '9a2859da-d504-11f1-80de-9840bb468dc0', 'payroll-1793435116337-7@example.com', 'leave', 'en', 'Your Unpaid Leave leave was approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-07) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 13:25:16', NULL, '2026-10-31 13:25:28', NULL, '2026-10-31 13:25:16'),
(12, 'leave:9a3e99da-d504-11f1-80de-9840bb468dc0:submitted:99e25724-d504-11f1-80de-9840bb468dc0', '99e25724-d504-11f1-80de-9840bb468dc0', 'payroll-admin-1793435116337@example.com', 'leave', 'en', 'Leave request needs review — RejectedLeave 8', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 13:25:16', NULL, '2026-10-31 13:25:27', NULL, '2026-10-31 13:25:16'),
(13, 'leave:9a3e99da-d504-11f1-80de-9840bb468dc0:decision:rejected:9a36c377-d504-11f1-80de-9840bb468dc0', '9a36c377-d504-11f1-80de-9840bb468dc0', 'payroll-1793435116337-8@example.com', 'leave', 'en', 'Your Unpaid Leave leave was rejected', 'Leave rejected', 'Your Unpaid Leave leave request (2026-10-12 to 2026-10-12) was rejected.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 13:25:16', NULL, '2026-10-31 13:25:26', NULL, '2026-10-31 13:25:16'),
(14, 'leave:9a4ac91d-d504-11f1-80de-9840bb468dc0:submitted:99e25724-d504-11f1-80de-9840bb468dc0', '99e25724-d504-11f1-80de-9840bb468dc0', 'payroll-admin-1793435116337@example.com', 'leave', 'en', 'Leave request needs review — InsufficientLeave 9', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 13:25:17', NULL, '2026-10-31 13:25:30', NULL, '2026-10-31 13:25:17'),
(15, 'leave:9a4ac91d-d504-11f1-80de-9840bb468dc0:decision:rejected:9a4451ad-d504-11f1-80de-9840bb468dc0', '9a4451ad-d504-11f1-80de-9840bb468dc0', 'payroll-1793435116337-9@example.com', 'leave', 'en', 'Your Unpaid Leave leave was rejected', 'Leave rejected', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-07) was rejected.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 13:25:17', NULL, '2026-10-31 13:25:31', NULL, '2026-10-31 13:25:17'),
(16, 'leave:9a5bec20-d504-11f1-80de-9840bb468dc0:submitted:99e25724-d504-11f1-80de-9840bb468dc0', '99e25724-d504-11f1-80de-9840bb468dc0', 'payroll-admin-1793435116337@example.com', 'leave', 'en', 'Leave request needs review — PaidLeaveFlow 11', 'New leave request', 'PaidLeaveFlow 11 requested 1 day(s) of Sick Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 13:25:17', NULL, '2026-10-31 13:25:35', NULL, '2026-10-31 13:25:17'),
(17, 'leave:9a5bec20-d504-11f1-80de-9840bb468dc0:decision:approved:9a57e157-d504-11f1-80de-9840bb468dc0', '9a57e157-d504-11f1-80de-9840bb468dc0', 'payroll-1793435116337-11@example.com', 'leave', 'en', 'Your Sick Leave leave was approved', 'Leave approved', 'Your Sick Leave leave request (2026-10-12 to 2026-10-12) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 13:25:17', NULL, '2026-10-31 13:25:34', NULL, '2026-10-31 13:25:17'),
(18, 'leave:9a684a28-d504-11f1-80de-9840bb468dc0:submitted:99e25724-d504-11f1-80de-9840bb468dc0', '99e25724-d504-11f1-80de-9840bb468dc0', 'payroll-admin-1793435116337@example.com', 'leave', 'en', 'Leave request needs review — AllocationEdit 12', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 13:25:17', NULL, '2026-10-31 13:25:32', NULL, '2026-10-31 13:25:17'),
(19, 'leave:9a684a28-d504-11f1-80de-9840bb468dc0:decision:approved:9a60ce7c-d504-11f1-80de-9840bb468dc0', '9a60ce7c-d504-11f1-80de-9840bb468dc0', 'payroll-1793435116337-12@example.com', 'leave', 'en', 'Your Unpaid Leave leave was approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-06) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 13:25:17', NULL, '2026-10-31 13:25:36', NULL, '2026-10-31 13:25:17'),
(20, 'payroll:4ad0c76e-c791-4d60-a1e9-aae77d7b6f65:payslip-ready', '9a8cf024-d504-11f1-80de-9840bb468dc0', 'payroll-1793435116337-18@example.com', 'payroll', 'en', 'Your October 2026 payslip is ready', 'Your October 2026 payslip is ready', 'Your payslip for October 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-10-31 13:25:17', NULL, '2026-10-31 13:25:42', NULL, '2026-10-31 13:25:17'),
(21, 'payroll:14:2026-10:completed:99e25724-d504-11f1-80de-9840bb468dc0', '99e25724-d504-11f1-80de-9840bb468dc0', 'payroll-admin-1793435116337@example.com', 'payroll', 'en', 'October 2026 payroll generated', 'Payroll generation complete', 'Payroll for October 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 1, '2026-10-31 13:25:17', NULL, '2026-10-31 13:25:45', NULL, '2026-10-31 13:25:17'),
(22, 'payroll:8d0ebf73-c68a-4b4d-8df5-74ab30f62eab:payslip-ready', '9a8cf024-d504-11f1-80de-9840bb468dc0', 'payroll-1793435116337-18@example.com', 'payroll', 'en', 'Your October 2026 payslip is ready', 'Your October 2026 payslip is ready', 'Your payslip for October 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-10-31 13:25:17', NULL, '2026-10-31 13:25:43', NULL, '2026-10-31 13:25:17'),
(24, 'payroll:37:2026-10:completed:fc3615e3-d505-11f1-80de-9840bb468dc0', 'fc3615e3-d505-11f1-80de-9840bb468dc0', 'payroll-runner-1793435710787@example.com', 'payroll', 'en', 'October 2026 payroll generated', 'Payroll generation complete', 'Payroll for October 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 1, '2026-10-31 13:35:11', NULL, '2026-10-31 13:35:16', NULL, '2026-10-31 13:35:11'),
(31, 'payroll:39:2026-10:completed:d684ecfa-d506-11f1-80de-9840bb468dc0', 'd684ecfa-d506-11f1-80de-9840bb468dc0', 'payroll-runner-1793436077066@example.com', 'payroll', 'en', 'October 2026 payroll generated', 'Payroll generation complete', 'Payroll for October 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 1, '2026-10-31 13:41:17', NULL, '2026-10-31 13:41:22', NULL, '2026-10-31 13:41:17'),
(38, 'payroll:41:2026-10:completed:ea3ca0bc-d506-11f1-80de-9840bb468dc0', 'ea3ca0bc-d506-11f1-80de-9840bb468dc0', 'payroll-runner-1793436110153@example.com', 'payroll', 'en', 'October 2026 payroll generated', 'Payroll generation complete', 'Payroll for October 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 1, '2026-10-31 13:41:50', NULL, '2026-10-31 13:41:55', NULL, '2026-10-31 13:41:50'),
(45, 'payroll:43:2026-10:completed:1e7cc3bd-d507-11f1-80de-9840bb468dc0', '1e7cc3bd-d507-11f1-80de-9840bb468dc0', 'payroll-runner-1793436197815@example.com', 'payroll', 'en', 'October 2026 payroll generated', 'Payroll generation complete', 'Payroll for October 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 2, '2026-10-31 13:43:18', NULL, '2026-10-31 13:53:30', NULL, '2026-10-31 13:43:18'),
(52, 'payroll:45:2026-10:completed:27e06c75-d507-11f1-80de-9840bb468dc0', '27e06c75-d507-11f1-80de-9840bb468dc0', 'payroll-runner-1793436213566@example.com', 'payroll', 'en', 'October 2026 payroll generated', 'Payroll generation complete', 'Payroll for October 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 1, '2026-10-31 13:43:34', NULL, '2026-10-31 13:43:39', NULL, '2026-10-31 13:43:34'),
(59, 'leave:77bce94c-d52e-11f1-9f66-9840bb468dc0:submitted:7766a300-d52e-11f1-9f66-9840bb468dc0', '7766a300-d52e-11f1-9f66-9840bb468dc0', 'payroll-admin-1793453097351@example.com', 'leave', 'en', 'Leave request needs review — RejectedLeave 8', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:24:57', NULL, '2026-10-31 18:25:01', NULL, '2026-10-31 18:24:57'),
(60, 'leave:77c8efc1-d52e-11f1-9f66-9840bb468dc0:submitted:7766a300-d52e-11f1-9f66-9840bb468dc0', '7766a300-d52e-11f1-9f66-9840bb468dc0', 'payroll-admin-1793453097351@example.com', 'leave', 'en', 'Leave request needs review — InsufficientLeave 9', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:24:58', NULL, '2026-10-31 18:25:03', NULL, '2026-10-31 18:24:58'),
(61, 'leave:77d8db1d-d52e-11f1-9f66-9840bb468dc0:submitted:7766a300-d52e-11f1-9f66-9840bb468dc0', '7766a300-d52e-11f1-9f66-9840bb468dc0', 'payroll-admin-1793453097351@example.com', 'leave', 'en', 'Leave request needs review — AllocationEdit 12', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:24:58', NULL, '2026-10-31 18:25:13', NULL, '2026-10-31 18:24:58'),
(62, 'leave:77d8db1d-d52e-11f1-9f66-9840bb468dc0:decision:approved:77d02d6f-d52e-11f1-9f66-9840bb468dc0', '77d02d6f-d52e-11f1-9f66-9840bb468dc0', 'payroll-1793453097351-12@example.com', 'leave', 'en', 'Your Unpaid Leave leave was approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-06) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 18:24:58', NULL, '2026-10-31 18:25:16', NULL, '2026-10-31 18:24:58'),
(63, 'leave:8abe3893-d52e-11f1-9f66-9840bb468dc0:submitted:8a580fe5-d52e-11f1-9f66-9840bb468dc0', '8a580fe5-d52e-11f1-9f66-9840bb468dc0', 'payroll-admin-1793453129128@example.com', 'leave', 'en', 'Leave request needs review — RejectedLeave 8', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:25:29', NULL, '2026-10-31 18:25:43', NULL, '2026-10-31 18:25:29'),
(64, 'leave:8acbc47e-d52e-11f1-9f66-9840bb468dc0:submitted:8a580fe5-d52e-11f1-9f66-9840bb468dc0', '8a580fe5-d52e-11f1-9f66-9840bb468dc0', 'payroll-admin-1793453129128@example.com', 'leave', 'en', 'Leave request needs review — InsufficientLeave 9', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:25:29', NULL, '2026-10-31 18:25:51', NULL, '2026-10-31 18:25:29'),
(65, 'leave:8adab246-d52e-11f1-9f66-9840bb468dc0:submitted:8a580fe5-d52e-11f1-9f66-9840bb468dc0', '8a580fe5-d52e-11f1-9f66-9840bb468dc0', 'payroll-admin-1793453129128@example.com', 'leave', 'en', 'Leave request needs review — AllocationEdit 12', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:25:30', NULL, '2026-10-31 18:25:49', NULL, '2026-10-31 18:25:30'),
(66, 'leave:8adab246-d52e-11f1-9f66-9840bb468dc0:decision:approved:8ad2e357-d52e-11f1-9f66-9840bb468dc0', '8ad2e357-d52e-11f1-9f66-9840bb468dc0', 'payroll-1793453129128-12@example.com', 'leave', 'en', 'Your Unpaid Leave leave was approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-06) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 18:25:30', NULL, '2026-10-31 18:25:40', NULL, '2026-10-31 18:25:30'),
(67, 'leave:9f4fa353-d52f-11f1-9f66-9840bb468dc0:submitted:9f007142-d52f-11f1-9f66-9840bb468dc0', '9f007142-d52f-11f1-9f66-9840bb468dc0', 'payroll-admin-1793453593288@example.com', 'leave', 'en', 'Leave request needs review — RejectedLeave 8', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:33:13', NULL, '2026-10-31 18:33:20', NULL, '2026-10-31 18:33:13'),
(68, 'leave:9f58c91f-d52f-11f1-9f66-9840bb468dc0:submitted:9f007142-d52f-11f1-9f66-9840bb468dc0', '9f007142-d52f-11f1-9f66-9840bb468dc0', 'payroll-admin-1793453593288@example.com', 'leave', 'en', 'Leave request needs review — InsufficientLeave 9', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:33:13', NULL, '2026-10-31 18:33:30', NULL, '2026-10-31 18:33:13'),
(69, 'leave:9f66b225-d52f-11f1-9f66-9840bb468dc0:submitted:9f007142-d52f-11f1-9f66-9840bb468dc0', '9f007142-d52f-11f1-9f66-9840bb468dc0', 'payroll-admin-1793453593288@example.com', 'leave', 'en', 'Leave request needs review — AllocationEdit 12', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:33:13', NULL, '2026-10-31 18:33:37', NULL, '2026-10-31 18:33:13'),
(70, 'leave:9f66b225-d52f-11f1-9f66-9840bb468dc0:decision:approved:9f5fd5d3-d52f-11f1-9f66-9840bb468dc0', '9f5fd5d3-d52f-11f1-9f66-9840bb468dc0', 'payroll-1793453593288-12@example.com', 'leave', 'en', 'Your Unpaid Leave leave was approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-06) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 18:33:13', NULL, '2026-10-31 18:33:34', NULL, '2026-10-31 18:33:13'),
(71, 'leave:62c32ee0-d532-11f1-9f66-9840bb468dc0:submitted:624fe83a-d532-11f1-9f66-9840bb468dc0', '624fe83a-d532-11f1-9f66-9840bb468dc0', 'payroll-admin-1793454779873@example.com', 'leave', 'en', 'Leave request needs review — RejectedLeave 8', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:53:00', NULL, '2026-10-31 18:53:04', NULL, '2026-10-31 18:53:00'),
(72, 'leave:62cf6b60-d532-11f1-9f66-9840bb468dc0:submitted:624fe83a-d532-11f1-9f66-9840bb468dc0', '624fe83a-d532-11f1-9f66-9840bb468dc0', 'payroll-admin-1793454779873@example.com', 'leave', 'en', 'Leave request needs review — InsufficientLeave 9', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:53:00', NULL, '2026-10-31 18:53:07', NULL, '2026-10-31 18:53:00'),
(73, 'leave:62cf6b60-d532-11f1-9f66-9840bb468dc0:decision:rejected:62c905aa-d532-11f1-9f66-9840bb468dc0', '62c905aa-d532-11f1-9f66-9840bb468dc0', 'payroll-1793454779873-9@example.com', 'leave', 'en', 'Your Unpaid Leave leave was rejected', 'Leave rejected', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-07) was rejected.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 18:53:00', NULL, '2026-10-31 18:53:17', NULL, '2026-10-31 18:53:00'),
(74, 'leave:62d96953-d532-11f1-9f66-9840bb468dc0:submitted:624fe83a-d532-11f1-9f66-9840bb468dc0', '624fe83a-d532-11f1-9f66-9840bb468dc0', 'payroll-admin-1793454779873@example.com', 'leave', 'en', 'Leave request needs review — PaidLeaveFlow 11', 'New leave request', 'PaidLeaveFlow 11 requested 1 day(s) of Sick Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:53:00', NULL, '2026-10-31 18:53:15', NULL, '2026-10-31 18:53:00'),
(75, 'leave:62d96953-d532-11f1-9f66-9840bb468dc0:decision:approved:62d6cbba-d532-11f1-9f66-9840bb468dc0', '62d6cbba-d532-11f1-9f66-9840bb468dc0', 'payroll-1793454779873-11@example.com', 'leave', 'en', 'Your Sick Leave leave was approved', 'Leave approved', 'Your Sick Leave leave request (2026-10-12 to 2026-10-12) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 18:53:00', NULL, '2026-10-31 18:53:19', NULL, '2026-10-31 18:53:00'),
(76, 'leave:62e3ed1c-d532-11f1-9f66-9840bb468dc0:submitted:624fe83a-d532-11f1-9f66-9840bb468dc0', '624fe83a-d532-11f1-9f66-9840bb468dc0', 'payroll-admin-1793454779873@example.com', 'leave', 'en', 'Leave request needs review — AllocationEdit 12', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:53:00', NULL, '2026-10-31 18:53:09', NULL, '2026-10-31 18:53:00'),
(77, 'leave:62e3ed1c-d532-11f1-9f66-9840bb468dc0:decision:approved:62ddf723-d532-11f1-9f66-9840bb468dc0', '62ddf723-d532-11f1-9f66-9840bb468dc0', 'payroll-1793454779873-12@example.com', 'leave', 'en', 'Your Unpaid Leave leave was approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-06) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 18:53:00', NULL, '2026-10-31 18:53:22', NULL, '2026-10-31 18:53:00'),
(78, 'leave:76632dd9-d532-11f1-9f66-9840bb468dc0:submitted:75ff8b1a-d532-11f1-9f66-9840bb468dc0', '75ff8b1a-d532-11f1-9f66-9840bb468dc0', 'payroll-admin-1793454812907@example.com', 'leave', 'en', 'Leave request needs review — RejectedLeave 8', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:53:33', NULL, '2026-10-31 18:53:39', NULL, '2026-10-31 18:53:33'),
(79, 'leave:767053c7-d532-11f1-9f66-9840bb468dc0:submitted:75ff8b1a-d532-11f1-9f66-9840bb468dc0', '75ff8b1a-d532-11f1-9f66-9840bb468dc0', 'payroll-admin-1793454812907@example.com', 'leave', 'en', 'Leave request needs review — InsufficientLeave 9', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:53:33', NULL, '2026-10-31 18:53:41', NULL, '2026-10-31 18:53:33'),
(80, 'leave:767053c7-d532-11f1-9f66-9840bb468dc0:decision:rejected:7667cf7d-d532-11f1-9f66-9840bb468dc0', '7667cf7d-d532-11f1-9f66-9840bb468dc0', 'payroll-1793454812907-9@example.com', 'leave', 'en', 'Your Unpaid Leave leave was rejected', 'Leave rejected', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-07) was rejected.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 18:53:33', NULL, '2026-10-31 18:53:43', NULL, '2026-10-31 18:53:33'),
(81, 'leave:7679e172-d532-11f1-9f66-9840bb468dc0:submitted:75ff8b1a-d532-11f1-9f66-9840bb468dc0', '75ff8b1a-d532-11f1-9f66-9840bb468dc0', 'payroll-admin-1793454812907@example.com', 'leave', 'en', 'Leave request needs review — PaidLeaveFlow 11', 'New leave request', 'PaidLeaveFlow 11 requested 1 day(s) of Sick Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:53:33', NULL, '2026-10-31 18:53:48', NULL, '2026-10-31 18:53:33'),
(82, 'leave:7679e172-d532-11f1-9f66-9840bb468dc0:decision:approved:7676d41d-d532-11f1-9f66-9840bb468dc0', '7676d41d-d532-11f1-9f66-9840bb468dc0', 'payroll-1793454812907-11@example.com', 'leave', 'en', 'Your Sick Leave leave was approved', 'Leave approved', 'Your Sick Leave leave request (2026-10-12 to 2026-10-12) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 18:53:33', NULL, '2026-10-31 18:53:50', NULL, '2026-10-31 18:53:33'),
(83, 'leave:76845d6c-d532-11f1-9f66-9840bb468dc0:submitted:75ff8b1a-d532-11f1-9f66-9840bb468dc0', '75ff8b1a-d532-11f1-9f66-9840bb468dc0', 'payroll-admin-1793454812907@example.com', 'leave', 'en', 'Leave request needs review — AllocationEdit 12', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 18:53:33', NULL, '2026-10-31 18:53:51', NULL, '2026-10-31 18:53:33'),
(84, 'leave:76845d6c-d532-11f1-9f66-9840bb468dc0:decision:approved:767e776e-d532-11f1-9f66-9840bb468dc0', '767e776e-d532-11f1-9f66-9840bb468dc0', 'payroll-1793454812907-12@example.com', 'leave', 'en', 'Your Unpaid Leave leave was approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-06) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 18:53:33', NULL, '2026-10-31 18:53:46', NULL, '2026-10-31 18:53:33'),
(85, 'leave:a0393e09-d533-11f1-9f66-9840bb468dc0:submitted:9fa578be-d533-11f1-9f66-9840bb468dc0', '9fa578be-d533-11f1-9f66-9840bb468dc0', 'payroll-admin-1793455312276@example.com', 'leave', 'en', 'Leave request needs review — RejectedLeave 8', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 19:01:53', NULL, '2026-10-31 19:02:03', NULL, '2026-10-31 19:01:53'),
(86, 'leave:a06873cc-d533-11f1-9f66-9840bb468dc0:submitted:9fa578be-d533-11f1-9f66-9840bb468dc0', '9fa578be-d533-11f1-9f66-9840bb468dc0', 'payroll-admin-1793455312276@example.com', 'leave', 'en', 'Leave request needs review — InsufficientLeave 9', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 19:01:53', NULL, '2026-10-31 19:02:09', NULL, '2026-10-31 19:01:53'),
(87, 'leave:a06873cc-d533-11f1-9f66-9840bb468dc0:decision:rejected:a055818b-d533-11f1-9f66-9840bb468dc0', 'a055818b-d533-11f1-9f66-9840bb468dc0', 'payroll-1793455312276-9@example.com', 'leave', 'en', 'Your Unpaid Leave leave was rejected', 'Leave rejected', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-07) was rejected.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 19:01:53', NULL, '2026-10-31 19:02:11', NULL, '2026-10-31 19:01:53'),
(88, 'leave:a07b438f-d533-11f1-9f66-9840bb468dc0:submitted:9fa578be-d533-11f1-9f66-9840bb468dc0', '9fa578be-d533-11f1-9f66-9840bb468dc0', 'payroll-admin-1793455312276@example.com', 'leave', 'en', 'Leave request needs review — PaidLeaveFlow 11', 'New leave request', 'PaidLeaveFlow 11 requested 1 day(s) of Sick Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 19:01:53', NULL, '2026-10-31 19:02:14', NULL, '2026-10-31 19:01:53'),
(89, 'leave:a07b438f-d533-11f1-9f66-9840bb468dc0:decision:approved:a0764015-d533-11f1-9f66-9840bb468dc0', 'a0764015-d533-11f1-9f66-9840bb468dc0', 'payroll-1793455312276-11@example.com', 'leave', 'en', 'Your Sick Leave leave was approved', 'Leave approved', 'Your Sick Leave leave request (2026-10-12 to 2026-10-12) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 19:01:53', NULL, '2026-10-31 19:02:15', NULL, '2026-10-31 19:01:53'),
(90, 'leave:a0920699-d533-11f1-9f66-9840bb468dc0:submitted:9fa578be-d533-11f1-9f66-9840bb468dc0', '9fa578be-d533-11f1-9f66-9840bb468dc0', 'payroll-admin-1793455312276@example.com', 'leave', 'en', 'Leave request needs review — AllocationEdit 12', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave. Please review the request in Dverif.', 'http://localhost:8080/org/leaves', 'sent', 1, '2026-10-31 19:01:53', NULL, '2026-10-31 19:02:12', NULL, '2026-10-31 19:01:53'),
(91, 'leave:a0920699-d533-11f1-9f66-9840bb468dc0:decision:approved:a08508d1-d533-11f1-9f66-9840bb468dc0', 'a08508d1-d533-11f1-9f66-9840bb468dc0', 'payroll-1793455312276-12@example.com', 'leave', 'en', 'Your Unpaid Leave leave was approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 to 2026-10-06) was approved.', 'http://localhost:8080/leaves', 'sent', 1, '2026-10-31 19:01:53', NULL, '2026-10-31 19:02:05', NULL, '2026-10-31 19:01:53'),
(92, 'payroll:95:2026-10:completed:a7799537-d533-11f1-9f66-9840bb468dc0', 'a7799537-d533-11f1-9f66-9840bb468dc0', 'payroll-runner-1793455325497@example.com', 'payroll', 'en', 'October 2026 payroll generated', 'Payroll generation complete', 'Payroll for October 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 1, '2026-10-31 19:02:06', NULL, '2026-10-31 19:02:20', NULL, '2026-10-31 19:02:06'),
(99, 'payroll:87114c01-e269-4ce8-8871-6b1594054766:payslip-ready', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'hunainhaider811@gmail.com', 'payroll', 'en', 'Your October 2026 payslip is ready', 'Your October 2026 payslip is ready', 'Your payslip for October 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-11-01 18:37:21', NULL, '2026-11-01 18:37:27', NULL, '2026-11-01 18:37:21'),
(100, 'payroll:1:2026-10:completed:c5f55cb3-d462-11f1-942b-9840bb468dc0', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'hunainhaider5566@gmail.com', 'payroll', 'en', 'October 2026 payroll generated', 'Payroll generation complete', 'Payroll for October 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 1, '2026-11-01 18:37:21', NULL, '2026-11-01 18:37:28', NULL, '2026-11-01 18:37:21'),
(101, 'payroll:1:2026-10:completed:352a7686-d473-11f1-942b-9840bb468dc0', '352a7686-d473-11f1-942b-9840bb468dc0', 'toobafatima811@gmail.com', 'payroll', 'en', 'October 2026 payroll generated', 'Payroll generation complete', 'Payroll for October 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 1, '2026-11-01 18:37:21', NULL, '2026-11-01 18:37:25', NULL, '2026-11-01 18:37:21'),
(102, 'payroll:e394975f-896a-4eda-b29e-fe8d14c1273f:payslip-ready', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'hunainhaider811@gmail.com', 'payroll', 'en', 'Your October 2026 payslip is ready', 'Your October 2026 payslip is ready', 'Your payslip for October 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-11-01 18:41:53', NULL, '2026-11-01 18:42:01', NULL, '2026-11-01 18:41:53'),
(105, 'payroll:c774c019-9011-4fb4-9841-9f37d6f86a30:payslip-ready', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'hunainhaider811@gmail.com', 'payroll', 'en', 'Your November 2026 payslip is ready', 'Your November 2026 payslip is ready', 'Your payslip for November 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-11-01 19:03:36', NULL, '2026-11-01 19:03:39', NULL, '2026-11-01 19:03:36'),
(106, 'payroll:1:2026-11:completed:c5f55cb3-d462-11f1-942b-9840bb468dc0', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'hunainhaider5566@gmail.com', 'payroll', 'en', 'November 2026 payroll generated', 'Payroll generation complete', 'Payroll for November 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 1, '2026-11-01 19:03:36', NULL, '2026-11-01 19:03:43', NULL, '2026-11-01 19:03:36'),
(107, 'payroll:1:2026-11:completed:352a7686-d473-11f1-942b-9840bb468dc0', '352a7686-d473-11f1-942b-9840bb468dc0', 'toobafatima811@gmail.com', 'payroll', 'en', 'November 2026 payroll generated', 'Payroll generation complete', 'Payroll for November 2026 was generated for 1 employee(s). 0 selected employee(s) were skipped because a record already existed. Review the payroll in Dverif.', 'http://localhost:8080/org/payroll', 'sent', 1, '2026-11-01 19:03:36', NULL, '2026-11-01 19:03:42', NULL, '2026-11-01 19:03:36'),
(110, 'payroll:f2f3de55-e330-405a-b844-69c392f26596:payslip-ready', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'hunainhaider811@gmail.com', 'payroll', 'en', 'Your October 2026 payslip is ready', 'Your October 2026 payslip is ready', 'Your payslip for October 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-11-01 20:20:55', NULL, '2026-11-01 20:21:00', NULL, '2026-11-01 20:20:55'),
(111, 'payroll:6cd34f88-9112-4511-854b-2d0e15692c67:payslip-ready', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'hunainhaider811@gmail.com', 'payroll', 'en', 'Your November 2026 payslip is ready', 'Your November 2026 payslip is ready', 'Your payslip for November 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-11-01 20:58:45', NULL, '2026-11-01 20:58:52', NULL, '2026-11-01 20:58:45'),
(114, 'payroll:cf383407-c77e-4e9b-b242-7c8972ac3c73:payslip-ready', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'hunainhaider811@gmail.com', 'payroll', 'en', 'Your October 2026 payslip is ready', 'Your October 2026 payslip is ready', 'Your payslip for October 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-11-01 21:00:16', NULL, '2026-11-01 21:00:23', NULL, '2026-11-01 21:00:16'),
(117, 'payroll:9010271e-038a-4a76-8e1c-c90d6fa682bf:payslip-ready', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'hunainhaider811@gmail.com', 'payroll', 'en', 'Your October 2026 payslip is ready', 'Your October 2026 payslip is ready', 'Your payslip for October 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-11-01 21:37:22', NULL, '2026-11-01 21:37:31', NULL, '2026-11-01 21:37:22'),
(120, 'payroll:07625d58-142b-4235-b826-87c601a2991c:payslip-ready', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'hunainhaider811@gmail.com', 'payroll', 'en', 'Your October 2026 payslip is ready', 'Your October 2026 payslip is ready', 'Your payslip for October 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-11-01 21:38:39', NULL, '2026-11-01 21:38:44', NULL, '2026-11-01 21:38:39'),
(125, 'payroll:3f4de6ec-d9be-49b2-aa70-dc68dbc71b6c:payslip-ready', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'hunainhaider811@gmail.com', 'payroll', 'en', 'Your October 2026 payslip is ready', 'Your October 2026 payslip is ready', 'Your payslip for October 2026 has been generated. Sign in to Dverif to view it securely. Salary details are not included in this email.', 'http://localhost:8080/payroll', 'sent', 1, '2026-11-01 23:00:39', NULL, '2026-11-01 23:00:46', NULL, '2026-11-01 23:00:39'),
(128, 'attendance:digest:1:2026-11-02:c5f55cb3-d462-11f1-942b-9840bb468dc0', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'hunainhaider5566@gmail.com', 'attendance', 'en', 'Attendance exceptions — HakamTechSOl', 'Today\'s attendance exceptions', '3 employee attendance exception(s) need review:\nHadi Ali — absent/no check-in\ntesting — absent/no check-in\nTesting hunain — absent/no check-in', 'http://localhost:8080/org/attendance', 'sent', 1, '2026-11-02 18:00:37', NULL, '2026-11-02 18:00:45', NULL, '2026-11-02 18:00:37'),
(129, 'attendance:digest:1:2026-11-02:352a7686-d473-11f1-942b-9840bb468dc0', '352a7686-d473-11f1-942b-9840bb468dc0', 'toobafatima811@gmail.com', 'attendance', 'en', 'Attendance exceptions — HakamTechSOl', 'Today\'s attendance exceptions', '3 employee attendance exception(s) need review:\nHadi Ali — absent/no check-in\ntesting — absent/no check-in\nTesting hunain — absent/no check-in', 'http://localhost:8080/org/attendance', 'sent', 1, '2026-11-02 18:00:37', NULL, '2026-11-02 18:00:47', NULL, '2026-11-02 18:00:37');

-- --------------------------------------------------------

--
-- Table structure for table `employees`
--

CREATE TABLE `employees` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL,
  `employee_code` varchar(30) DEFAULT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `cnic` varchar(20) DEFAULT NULL,
  `designation_id` int(11) DEFAULT NULL,
  `department_id` int(11) DEFAULT NULL,
  `joining_date` date DEFAULT NULL,
  `employment_type` enum('full_time','part_time','contract','temporary','intern') DEFAULT NULL,
  `work_location` varchar(150) DEFAULT NULL,
  `reporting_manager_uuid` char(36) DEFAULT NULL,
  `emergency_contact` varchar(30) DEFAULT NULL,
  `status` enum('active','inactive','current_employee','ex_employee') NOT NULL DEFAULT 'current_employee',
  `is_platform_user` enum('yes','no') NOT NULL DEFAULT 'no',
  `linked_user_uuid` char(36) DEFAULT NULL,
  `added_by_uuid` char(36) DEFAULT NULL,
  `promoted_by_uuid` char(36) DEFAULT NULL,
  `promoted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `active_cnic` varchar(20) GENERATED ALWAYS AS (if(`status` <> 'ex_employee',`cnic`,NULL)) STORED,
  `active_email` varchar(190) GENERATED ALWAYS AS (if(`status` <> 'ex_employee',`email`,NULL)) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `employees`
--

INSERT INTO `employees` (`id`, `uuid`, `employee_code`, `organization_id`, `full_name`, `email`, `phone`, `cnic`, `designation_id`, `department_id`, `joining_date`, `employment_type`, `work_location`, `reporting_manager_uuid`, `emergency_contact`, `status`, `is_platform_user`, `linked_user_uuid`, `added_by_uuid`, `promoted_by_uuid`, `promoted_at`, `created_at`) VALUES
(1, '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 'EMP-000001', 1, 'Hadi Ali', 'hunainhaider811@gmail.com', '03182484933', '4250173883487', 2, 2, '2026-10-22', 'full_time', 'Office', NULL, '03182484933', 'current_employee', 'yes', '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 19:13:47', '2026-10-30 19:13:47'),
(2, 'fa4cd277-d475-11f1-942b-9840bb468dc0', 'EMP-000002', 1, 'testing', 'testing1@gmail.com', '03182484936', '4235656534673', 2, 3, '2026-12-31', 'full_time', 'office', NULL, '03182484936', 'current_employee', 'yes', 'fac36eca-d475-11f1-942b-9840bb468dc0', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 20:24:21', '2026-10-30 20:24:21'),
(3, '1e15125b-5da9-40c8-acfb-19bb963dff7e', 'EMP-000003', 1, 'Testing hunain', 'hunainhaider5522@gmail.com', '03182484922', '4250153637372', 2, 3, '2026-09-29', 'full_time', NULL, NULL, NULL, 'current_employee', 'no', NULL, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', NULL, NULL, '2026-10-30 22:13:23'),
(4, '86207d91-b251-46ed-a998-3b36cba9f939', 'EMP-000004', 1, 'M JUNAID SHAHID', 'muhammadjunaidshahidofficial@gmail.com', '+92 322 1315218', '4250187382878', 2, 3, '2026-11-30', 'full_time', NULL, NULL, NULL, 'ex_employee', 'no', NULL, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', NULL, NULL, '2026-10-30 22:36:10');

--
-- Triggers `employees`
--
DELIMITER $$
CREATE TRIGGER `bi_employees_uuid` BEFORE INSERT ON `employees` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `employee_documents`
--

CREATE TABLE `employee_documents` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `document_type` varchar(100) DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size` bigint(20) UNSIGNED DEFAULT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT current_timestamp(),
  `uploaded_by_uuid` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `document_hash` varchar(64) DEFAULT NULL,
  `extracted_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`extracted_data`)),
  `extraction_status` enum('not_attempted','succeeded','failed','not_applicable') NOT NULL DEFAULT 'not_attempted',
  `extraction_error` varchar(255) DEFAULT NULL,
  `extracted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `employee_documents`
--

INSERT INTO `employee_documents` (`id`, `uuid`, `employee_uuid`, `document_type`, `file_name`, `file_path`, `file_size`, `uploaded_at`, `uploaded_by_uuid`, `created_at`, `document_hash`, `extracted_data`, `extraction_status`, `extraction_error`, `extracted_at`) VALUES
(1, '38759a0e-d46c-11f1-942b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 'CV/Resume', 'Hunain_Haider_CV .pdf', 'documents/doc_1793369664912_583130171.pdf', 498351, '2026-10-30 19:14:30', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 19:14:30', '67f7f083b82ee2ab331d777b3e830dfcc61a687db06ce5aae4646042f5156ea3', '{\"document_type\":\"resume\",\"document_type_label\":\"CV/Resume\",\"fields\":{\"name\":{\"value\":\"HUNAIN HAIDER\",\"confidence\":\"high\"},\"cnic\":{\"value\":null,\"confidence\":\"not_visible\"},\"designation\":{\"value\":null,\"confidence\":\"not_visible\"},\"email\":{\"value\":\"hunainhaider811@gmail.com\",\"confidence\":\"high\"},\"phone\":{\"value\":\"+92 318 248 4396\",\"confidence\":\"high\"}}}', 'succeeded', NULL, '2026-10-30 19:14:30');

--
-- Triggers `employee_documents`
--
DELIMITER $$
CREATE TRIGGER `bi_employee_documents_uuid` BEFORE INSERT ON `employee_documents` FOR EACH ROW BEGIN
  IF NEW.uuid IS NULL OR NEW.uuid = '' THEN
    SET NEW.uuid = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `employee_leave_allocations`
--

CREATE TABLE `employee_leave_allocations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `leave_type_id` bigint(20) UNSIGNED NOT NULL,
  `year` smallint(5) UNSIGNED NOT NULL,
  `allocated_days` int(11) NOT NULL DEFAULT 0,
  `used_days` int(11) NOT NULL DEFAULT 0,
  `remaining_days` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `employee_leave_allocations`
--

INSERT INTO `employee_leave_allocations` (`id`, `uuid`, `employee_uuid`, `leave_type_id`, `year`, `allocated_days`, `used_days`, `remaining_days`, `created_at`) VALUES
(1, 'd068897c-d470-11f1-942b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 2, 2026, 20, 9, 11, '2026-10-30 19:47:23'),
(2, 'd30c6294-d470-11f1-942b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 1, 2026, 20, 2, 18, '2026-10-30 19:47:27'),
(3, 'fa526da7-d475-11f1-942b-9840bb468dc0', 'fa4cd277-d475-11f1-942b-9840bb468dc0', 2, 2026, 20, 0, 20, '2026-10-30 20:24:21'),
(4, 'fa52c145-d475-11f1-942b-9840bb468dc0', 'fa4cd277-d475-11f1-942b-9840bb468dc0', 1, 2026, 20, 0, 20, '2026-10-30 20:24:21'),
(6, '360f42a5-d485-11f1-942b-9840bb468dc0', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 2, 2026, 20, 0, 20, '2026-10-30 22:13:23'),
(7, '36101864-d485-11f1-942b-9840bb468dc0', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 1, 2026, 20, 0, 20, '2026-10-30 22:13:23'),
(9, '64b0e218-d488-11f1-942b-9840bb468dc0', '86207d91-b251-46ed-a998-3b36cba9f939', 2, 2026, 20, 0, 20, '2026-10-30 22:36:10'),
(10, '64b15ab3-d488-11f1-942b-9840bb468dc0', '86207d91-b251-46ed-a998-3b36cba9f939', 1, 2026, 20, 0, 20, '2026-10-30 22:36:10');

--
-- Triggers `employee_leave_allocations`
--
DELIMITER $$
CREATE TRIGGER `bi_employee_leave_allocations_uuid` BEFORE INSERT ON `employee_leave_allocations` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `employee_salary_components`
--

CREATE TABLE `employee_salary_components` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `salary_component_id` int(11) NOT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `assigned_by` bigint(20) UNSIGNED DEFAULT NULL,
  `assigned_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `employee_salary_components`
--

INSERT INTO `employee_salary_components` (`id`, `uuid`, `employee_uuid`, `salary_component_id`, `amount`, `is_active`, `assigned_by`, `assigned_at`, `updated_at`) VALUES
(83, 'c7d446d4-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 1, 3000.00, 1, NULL, '2026-11-01 18:40:20', '2026-11-01 18:40:20'),
(84, 'c7d485ab-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 90, 5000.00, 1, NULL, '2026-11-01 18:40:20', '2026-11-01 18:40:20'),
(85, 'c7d4d33b-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 91, 2000.00, 1, NULL, '2026-11-01 18:40:20', '2026-11-01 18:40:20'),
(87, 'c7d5656a-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 93, 500.00, 1, NULL, '2026-11-01 18:40:20', '2026-11-01 18:40:20');

--
-- Triggers `employee_salary_components`
--
DELIMITER $$
CREATE TRIGGER `bi_employee_salary_components_uuid` BEFORE INSERT ON `employee_salary_components` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `employee_salary_history`
--

CREATE TABLE `employee_salary_history` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `year` smallint(5) UNSIGNED NOT NULL,
  `basic_salary` decimal(14,2) NOT NULL DEFAULT 0.00,
  `effective_from` date NOT NULL,
  `effective_to` date DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `employee_salary_history`
--

INSERT INTO `employee_salary_history` (`id`, `uuid`, `employee_uuid`, `year`, `basic_salary`, `effective_from`, `effective_to`, `created_by`, `created_at`) VALUES
(1, '1ee5fdb3-d46c-11f1-942b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 2026, 20000.00, '2026-10-22', NULL, NULL, '2026-10-30 19:13:47'),
(2, 'fa534045-d475-11f1-942b-9840bb468dc0', 'fa4cd277-d475-11f1-942b-9840bb468dc0', 2026, 20000.00, '2026-12-31', NULL, NULL, '2026-10-30 20:24:21'),
(3, '36103cfe-d485-11f1-942b-9840bb468dc0', '1e15125b-5da9-40c8-acfb-19bb963dff7e', 2026, 2000.00, '2026-10-28', NULL, NULL, '2026-10-30 22:13:23'),
(4, '64b18309-d488-11f1-942b-9840bb468dc0', '86207d91-b251-46ed-a998-3b36cba9f939', 2026, 200000.00, '2026-11-30', NULL, NULL, '2026-10-30 22:36:10');

--
-- Triggers `employee_salary_history`
--
DELIMITER $$
CREATE TRIGGER `bi_employee_salary_history_uuid` BEFORE INSERT ON `employee_salary_history` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `exit_requests`
--

CREATE TABLE `exit_requests` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `employee_name` varchar(200) NOT NULL,
  `designation` varchar(150) DEFAULT NULL,
  `request_type` enum('resignation','termination') NOT NULL,
  `last_working_day` date NOT NULL,
  `reason` varchar(1000) DEFAULT NULL,
  `status` enum('pending','approved','rejected','completed') NOT NULL DEFAULT 'pending',
  `decided_by` char(36) DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `decision_notes` varchar(1000) DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `hr_notes` text DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `open_exit_guard` tinyint(4) GENERATED ALWAYS AS (case when `status` in ('pending','approved') then 1 else NULL end) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `exit_requests`
--

INSERT INTO `exit_requests` (`id`, `uuid`, `organization_id`, `employee_uuid`, `employee_name`, `designation`, `request_type`, `last_working_day`, `reason`, `status`, `decided_by`, `decided_at`, `decision_notes`, `completed_at`, `hr_notes`, `created_by`, `created_at`, `updated_at`) VALUES
(2, '37441858-20db-4b0f-986d-c1590de1c3d4', 1, '86207d91-b251-46ed-a998-3b36cba9f939', 'M JUNAID SHAHID', 'Manager', 'termination', '2026-11-02', 'teting', 'completed', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-02 16:10:33', 'etsing', '2026-11-02 16:10:42', 'testis', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-02 16:09:49', '2026-11-02 16:10:42');

-- --------------------------------------------------------

--
-- Table structure for table `expense_claims`
--

CREATE TABLE `expense_claims` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `employee_name` varchar(200) NOT NULL,
  `expense_name` varchar(160) NOT NULL,
  `category_uuid` char(36) DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL,
  `expense_date` date NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `status` enum('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
  `payment_mode` enum('payroll','direct') NOT NULL DEFAULT 'payroll',
  `reviewed_by_uuid` char(36) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `rejection_reason` varchar(500) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `paid_via_salary_record_uuid` char(36) DEFAULT NULL,
  `payment_reference` varchar(120) DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `expense_year` smallint(5) UNSIGNED GENERATED ALWAYS AS (year(`expense_date`)) STORED,
  `expense_month` tinyint(3) UNSIGNED GENERATED ALWAYS AS (month(`expense_date`)) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `expense_claims`
--

INSERT INTO `expense_claims` (`id`, `uuid`, `organization_id`, `employee_uuid`, `employee_name`, `expense_name`, `category_uuid`, `amount`, `expense_date`, `description`, `status`, `payment_mode`, `reviewed_by_uuid`, `reviewed_at`, `rejection_reason`, `paid_at`, `paid_via_salary_record_uuid`, `payment_reference`, `created_by`, `created_at`, `updated_at`) VALUES
(156, '33cd0649-b0ec-4d36-bb64-6c8e2a28561f', 1, '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 'Hadi Ali', 'testing', NULL, 2000.00, '2026-10-31', 'tesitngnkfnkdnk', 'paid', 'payroll', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 14:27:04', NULL, '2026-11-01 18:37:21', '87114c01-e269-4ce8-8871-6b1594054766', NULL, '1f228ba4-d46c-11f1-942b-9840bb468dc0', '2026-10-31 14:26:51', '2026-11-01 18:37:21'),
(219, '4db27dd6-d8fa-468e-b2b4-6b45d9219edf', 1, '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 'Hadi Ali', 'Testing', NULL, 3000.00, '2026-11-01', 'testing', 'rejected', 'payroll', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:50:21', 'this is not valid', NULL, NULL, NULL, '1f228ba4-d46c-11f1-942b-9840bb468dc0', '2026-11-01 18:50:04', '2026-11-01 18:50:21'),
(220, 'ade93218-aae4-4c72-996d-0fe2184e336c', 1, '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 'Hadi Ali', 'testing', NULL, 1000.00, '2026-11-01', 'testing', 'paid', 'payroll', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 19:17:19', NULL, '2026-11-01 20:58:45', '6cd34f88-9112-4511-854b-2d0e15692c67', NULL, '1f228ba4-d46c-11f1-942b-9840bb468dc0', '2026-11-01 19:16:50', '2026-11-01 20:58:45'),
(221, '35251ed6-1cdf-45ad-a0f9-24762a469f3b', 1, '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 'Hadi Ali', 'tersbhdgjs', NULL, 2000.00, '2026-11-01', 'ughsjhjdj', 'approved', 'direct', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 19:17:46', NULL, NULL, NULL, NULL, '1f228ba4-d46c-11f1-942b-9840bb468dc0', '2026-11-01 19:17:39', '2026-11-01 19:17:46');

-- --------------------------------------------------------

--
-- Table structure for table `final_settlements`
--

CREATE TABLE `final_settlements` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `exit_request_uuid` char(36) NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `basic_salary` decimal(14,2) NOT NULL DEFAULT 0.00,
  `working_days_in_month` int(11) NOT NULL DEFAULT 0,
  `per_day_rate` decimal(14,2) NOT NULL DEFAULT 0.00,
  `leave_encashment_days` decimal(8,2) NOT NULL DEFAULT 0.00,
  `leave_encashment_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `asset_deductions` decimal(14,2) NOT NULL DEFAULT 0.00,
  `asset_deductions_exposure` decimal(14,2) NOT NULL DEFAULT 0.00,
  `unreturned_asset_count` int(11) NOT NULL DEFAULT 0,
  `net_fnf_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `status` enum('draft','processed','paid') NOT NULL DEFAULT 'draft',
  `processed_by` char(36) DEFAULT NULL,
  `processed_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `payment_reference` varchar(120) DEFAULT NULL,
  `notes` varchar(1000) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `holidays`
--

CREATE TABLE `holidays` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(150) NOT NULL,
  `date` date NOT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `hr_letters`
--

CREATE TABLE `hr_letters` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `template_uuid` char(36) DEFAULT NULL,
  `letter_type` enum('offer','increment','experience','employment_confirmation','warning','appreciation','custom') NOT NULL DEFAULT 'custom',
  `reference_no` varchar(40) NOT NULL,
  `title` varchar(200) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `body_snapshot` longtext DEFAULT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `qr_token` char(64) DEFAULT NULL,
  `qr_signature` char(64) DEFAULT NULL,
  `status` enum('draft','issued','revoked') NOT NULL DEFAULT 'draft',
  `issued_by_uuid` char(36) DEFAULT NULL,
  `issued_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `revoked_reason` varchar(500) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `hr_letters`
--

INSERT INTO `hr_letters` (`id`, `uuid`, `organization_id`, `employee_uuid`, `template_uuid`, `letter_type`, `reference_no`, `title`, `payload`, `body_snapshot`, `file_path`, `qr_token`, `qr_signature`, `status`, `issued_by_uuid`, `issued_at`, `revoked_at`, `revoked_reason`, `notes`, `created_at`) VALUES
(1, '8a4f71e5-d49f-11f1-9047-9840bb468dc0', 1, '86207d91-b251-46ed-a998-3b36cba9f939', '67015b8f-623d-44bc-9f7e-284f5f75d82b', 'increment', 'HR/2026/0001', 'Offer Letter', '{\"employee_name\":\"M JUNAID SHAHID\",\"designation\":\"Manager\",\"department\":\"HR\",\"joining_date\":\"2026-11-29T19:00:00.000Z\",\"cnic\":\"4250187382878\",\"organization_name\":\"HakamTechSOl\",\"issue_date\":\"2026-10-31T09:42:53.724Z\",\"letter_date\":\"2026-10-31T09:42:53.724Z\",\"reference_no\":\"HR/2026/0001\",\"current_salary\":\"\",\"new_salary\":\"20000\",\"effective_date\":\"\",\"increment_percentage\":\"\",\"total_experience\":\"\",\"last_working_date\":\"\",\"warning_reason\":\"\"}', 'Date: 31-Oct-2026\n\nRef No: HR/2026/0001\n\nTo,\n\nM JUNAID SHAHID\n\nCNIC: 4250187382878\n\nSubject: Offer of Employment - Manager\n\nDear M JUNAID SHAHID,\n\nHumaray paas aap ke liye khushkhabri hai! HakamTechSOl aap ko Manager ki position offer karte hue behad khushi mehsus kar raha hai. Aap ki appointment HR department me hogi.\n\nAap ki joining aur compensation ki Tafseelat (Details) neeche darj hain:\n\nDesignation: Manager\n\nDepartment: HR\n\nDate of Joining: 30-Nov-2026\n\nCurrent / Base Salary: 20000\n\nIssue Date: 31-Oct-2026\n\n(Note: Direct compensation 30-Nov-2026 se lagu hogi aur payroll organization ki currency aur pay-frequency policy ke mutabiq manage kiya jaye ga.)\n\nAap ko jald hi ek detailed Employment Contract bheja jaye ga jis me terms & conditions, benefits, aur company policies ki mukammal tafseelat hongi.\n\nKharaye-karam is offer letter ko sign karke accept karein aur humein wapas send karein taake aap ka onboarding process shuru kiya ja sakay.\n\nHum aap ko HakamTechSOl ki team me welcome karne ke liye pur-josh hain!\n\nSincerely,\n\nHuman Resources Department\n\nHakamTechSOl\n\nAcceptance of Offer:\n\nMain is Offer Letter ki tamaam terms aur conditions ko samajhta/samajhti hoon aur is employment offer ko qabool karta/karti hoon.', NULL, '31f19307acfb51a20cb1e5b5052036a080454f8f956b2d84cc05a673791a038d', '585388ac267b0e04ec849731cfddcccf68d48fc7dc547e63175410bfa23234ba', 'issued', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 14:42:53', NULL, NULL, NULL, '2026-10-31 01:21:51'),
(2, '67e85465-d50f-11f1-80de-9840bb468dc0', 1, '86207d91-b251-46ed-a998-3b36cba9f939', '67015b8f-623d-44bc-9f7e-284f5f75d82b', 'offer', 'HR/2026/0002', 'Offer Letter', '{\"employee_name\":\"M JUNAID SHAHID\",\"designation\":\"Manager\",\"department\":\"HR\",\"joining_date\":\"2026-11-29T19:00:00.000Z\",\"cnic\":\"4250187382878\",\"organization_name\":\"HakamTechSOl\",\"issue_date\":\"2026-10-31T09:42:42.876Z\",\"letter_date\":\"2026-10-31T09:42:42.876Z\",\"reference_no\":\"HR/2026/0002\",\"current_salary\":\"\",\"new_salary\":\"20000\",\"effective_date\":\"\",\"increment_percentage\":\"\",\"total_experience\":\"\",\"last_working_date\":\"\",\"warning_reason\":\"\"}', 'Date: 31-Oct-2026\n\nRef No: HR/2026/0002\n\nTo,\n\nM JUNAID SHAHID\n\nCNIC: 4250187382878\n\nSubject: Offer of Employment - Manager\n\nDear M JUNAID SHAHID,\n\nHumaray paas aap ke liye khushkhabri hai! HakamTechSOl aap ko Manager ki position offer karte hue behad khushi mehsus kar raha hai. Aap ki appointment HR department me hogi.\n\nAap ki joining aur compensation ki Tafseelat (Details) neeche darj hain:\n\nDesignation: Manager\n\nDepartment: HR\n\nDate of Joining: 30-Nov-2026\n\nCurrent / Base Salary: 20000\n\nIssue Date: 31-Oct-2026\n\n(Note: Direct compensation 30-Nov-2026 se lagu hogi aur payroll organization ki currency aur pay-frequency policy ke mutabiq manage kiya jaye ga.)\n\nAap ko jald hi ek detailed Employment Contract bheja jaye ga jis me terms & conditions, benefits, aur company policies ki mukammal tafseelat hongi.\n\nKharaye-karam is offer letter ko sign karke accept karein aur humein wapas send karein taake aap ka onboarding process shuru kiya ja sakay.\n\nHum aap ko HakamTechSOl ki team me welcome karne ke liye pur-josh hain!\n\nSincerely,\n\nHuman Resources Department\n\nHakamTechSOl\n\nAcceptance of Offer:\n\nMain is Offer Letter ki tamaam terms aur conditions ko samajhta/samajhti hoon aur is employment offer ko qabool karta/karti hoon.', NULL, 'aca6a559ca8278ece802c7e09cbb99dc0feafb92187c39104fe8ec2e53c89bbd', '9a2f5e63f393a9df7f9e5ddf635765318e40b28e38bd65e27e296cee3959d2ff', 'issued', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 14:42:42', NULL, NULL, NULL, '2026-10-31 14:42:36'),
(3, 'e4223869-d5fb-11f1-959b-9840bb468dc0', 1, '1ee2f46e-d46c-11f1-942b-9840bb468dc0', '67015b8f-623d-44bc-9f7e-284f5f75d82b', 'offer', 'HR/2026/0003', 'Offer Letter', '{\"employee_name\":\"Hadi Ali\",\"designation\":\"Manager\",\"department\":\"IT\",\"joining_date\":\"2026-10-21T19:00:00.000Z\",\"cnic\":\"4250173883487\",\"organization_name\":\"HakamTechSOl\",\"issue_date\":\"2026-11-01T15:22:42.392Z\",\"letter_date\":\"2026-11-01T15:22:42.392Z\",\"reference_no\":\"HR/2026/0003\",\"current_salary\":\"\",\"new_salary\":\"20000\",\"effective_date\":\"\",\"increment_percentage\":\"\",\"total_experience\":\"\",\"last_working_date\":\"\",\"warning_reason\":\"\"}', 'Date: 01-Nov-2026\n\nRef No: HR/2026/0003\n\nTo,\n\nHadi Ali\n\nCNIC: 4250173883487\n\nSubject: Offer of Employment - Manager\n\nDear Hadi Ali,\n\nHumaray paas aap ke liye khushkhabri hai! HakamTechSOl aap ko Manager ki position offer karte hue behad khushi mehsus kar raha hai. Aap ki appointment IT department me hogi.\n\nAap ki joining aur compensation ki Tafseelat (Details) neeche darj hain:\n\nDesignation: Manager\n\nDepartment: IT\n\nDate of Joining: 22-Oct-2026\n\nCurrent / Base Salary: 20000\n\nIssue Date: 01-Nov-2026\n\n(Note: Direct compensation 22-Oct-2026 se lagu hogi aur payroll organization ki currency aur pay-frequency policy ke mutabiq manage kiya jaye ga.)\n\nAap ko jald hi ek detailed Employment Contract bheja jaye ga jis me terms & conditions, benefits, aur company policies ki mukammal tafseelat hongi.\n\nKharaye-karam is offer letter ko sign karke accept karein aur humein wapas send karein taake aap ka onboarding process shuru kiya ja sakay.\n\nHum aap ko HakamTechSOl ki team me welcome karne ke liye pur-josh hain!\n\nSincerely,\n\nHuman Resources Department\n\nHakamTechSOl\n\nAcceptance of Offer:\n\nMain is Offer Letter ki tamaam terms aur conditions ko samajhta/samajhti hoon aur is employment offer ko qabool karta/karti hoon.', NULL, '1ae60df70830e5ca307539882657dccefc876f9833a36d1933a1efe3116fec3f', '96dbd395d296174d61bfdc8b4aa7ee4e455bad064f6f8b3d197b7d433668f539', 'issued', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 20:22:42', NULL, NULL, NULL, '2026-11-01 18:55:26'),
(4, 'b0fff0f9-d61e-11f1-959b-9840bb468dc0', 1, '1ee2f46e-d46c-11f1-942b-9840bb468dc0', '67015b8f-623d-44bc-9f7e-284f5f75d82b', 'offer', 'HR/2026/0004', 'Offer Letter', '{\"employee_name\":\"Hadi Ali\",\"designation\":\"Manager\",\"department\":\"IT\",\"joining_date\":\"2026-10-21T19:00:00.000Z\",\"cnic\":\"4250173883487\",\"organization_name\":\"HakamTechSOl\",\"issue_date\":\"2026-11-01T18:04:26.275Z\",\"letter_date\":\"2026-11-01T18:04:26.275Z\",\"reference_no\":\"HR/2026/0004\",\"current_salary\":\"\",\"new_salary\":\"332222\",\"effective_date\":\"\",\"increment_percentage\":\"\",\"total_experience\":\"\",\"last_working_date\":\"\",\"warning_reason\":\"\"}', 'Date: 01-Nov-2026\n\nRef No: HR/2026/0004\n\nTo,\n\nHadi Ali\nCNIC: 4250173883487\n\nSubject: Offer of Employment - Manager\n\nDear Hadi Ali,\n\nHumaray paas aap ke liye khushkhabri hai! HakamTechSOl aap ko Manager ki position offer karte hue behad khushi mehsus kar raha hai. Aap ki appointment IT department me hogi.\nAap ki joining aur compensation ki Tafseelat (Details) neeche darj hain:\n\nDesignation: Manager\nDepartment: IT\nDate of Joining: 22-Oct-2026\nCurrent / Base Salary: 332222\nIssue Date: 01-Nov-2026\n\n(Note: Direct compensation 22-Oct-2026 se lagu hogi aur payroll organization ki currency aur pay-frequency policy ke mutabiq manage kiya jaye ga.)\nAap ko jald hi ek detailed Employment Contract bheja jaye ga jis me terms & conditions, benefits, aur company policies ki mukammal tafseelat hongi.\nKharaye-karam is offer letter ko sign karke accept karein aur humein wapas send karein taake aap ka onboarding process shuru kiya ja sakay.\nHum aap ko HakamTechSOl ki team me welcome karne ke liye pur-josh hain!\n\nSincerely,\n\nHuman Resources Department\nHakamTechSOl\n\nAcceptance of Offer:\nMain is Offer Letter ki tamaam terms aur conditions ko samajhta/samajhti hoon aur is employment offer ko qabool karta/karti hoon.', NULL, '0dde6590f38f7bf2cb840aab9154dd7c62c53d82b62b95ed8a55ddc14e2e0ad7', 'e254b8b52bcd03abd826805551eec523e8d105d93a0fe1aa787a1e84e01c8ef3', 'issued', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 23:04:26', NULL, NULL, NULL, '2026-11-01 23:04:21'),
(5, 'b61c8d05-d6b2-11f1-9a5e-9840bb468dc0', 1, '1ee2f46e-d46c-11f1-942b-9840bb468dc0', '67015b8f-623d-44bc-9f7e-284f5f75d82b', 'offer', 'HR/2026/0005', 'Offer Letter', '{\"employee_name\":\"Hadi Ali\",\"designation\":\"Manager\",\"department\":\"IT\",\"joining_date\":\"2026-10-21T19:00:00.000Z\",\"cnic\":\"4250173883487\",\"organization_name\":\"HakamTechSOl\",\"issue_date\":\"2026-11-02T11:44:10.258Z\",\"letter_date\":\"2026-11-02T11:44:10.258Z\",\"reference_no\":\"HR/2026/0005\",\"current_salary\":\"\",\"new_salary\":\"22222\",\"effective_date\":\"\",\"increment_percentage\":\"\",\"total_experience\":\"\",\"last_working_date\":\"\",\"warning_reason\":\"\"}', 'Date: 02-Nov-2026\n\nRef No: HR/2026/0005\n\nTo,\n\nHadi Ali\nCNIC: 4250173883487\n\nSubject: Offer of Employment - Manager\n\nDear Hadi Ali,\n\nHumaray paas aap ke liye khushkhabri hai! HakamTechSOl aap ko Manager ki position offer karte hue behad khushi mehsus kar raha hai. Aap ki appointment IT department me hogi.\nAap ki joining aur compensation ki Tafseelat (Details) neeche darj hain:\n\nDesignation: Manager\nDepartment: IT\nDate of Joining: 22-Oct-2026\nCurrent / Base Salary: 22222\nIssue Date: 02-Nov-2026\n\n(Note: Direct compensation 22-Oct-2026 se lagu hogi aur payroll organization ki currency aur pay-frequency policy ke mutabiq manage kiya jaye ga.)\nAap ko jald hi ek detailed Employment Contract bheja jaye ga jis me terms & conditions, benefits, aur company policies ki mukammal tafseelat hongi.\nKharaye-karam is offer letter ko sign karke accept karein aur humein wapas send karein taake aap ka onboarding process shuru kiya ja sakay.\nHum aap ko HakamTechSOl ki team me welcome karne ke liye pur-josh hain!\n\nSincerely,\n\nHuman Resources Department\nHakamTechSOl\n\nAcceptance of Offer:\nMain is Offer Letter ki tamaam terms aur conditions ko samajhta/samajhti hoon aur is employment offer ko qabool karta/karti hoon.', NULL, '455ac20276ee715c0d1cf7bb99dd7b51395df65d179c002d050829ef14cfba4c', '680ac87580954d07a8e40e2cbf91cbcd6976ced600d385e7242ba9323b7cfe28', 'issued', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-02 16:44:10', NULL, NULL, NULL, '2026-11-02 16:44:05');

--
-- Triggers `hr_letters`
--
DELIMITER $$
CREATE TRIGGER `bi_hr_letters_uuid` BEFORE INSERT ON `hr_letters` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `interviews`
--

CREATE TABLE `interviews` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `candidate_uuid` char(36) NOT NULL,
  `interviewer_uuid` char(36) DEFAULT NULL,
  `scheduled_at` datetime NOT NULL,
  `mode` enum('onsite','phone','video','other') DEFAULT NULL,
  `location` varchar(150) DEFAULT NULL,
  `feedback_notes` text DEFAULT NULL,
  `rating` decimal(3,2) DEFAULT NULL,
  `status` enum('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  `outcome` enum('pending','passed','failed') NOT NULL DEFAULT 'pending',
  `created_by_uuid` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `interviews`
--

INSERT INTO `interviews` (`id`, `uuid`, `organization_id`, `candidate_uuid`, `interviewer_uuid`, `scheduled_at`, `mode`, `location`, `feedback_notes`, `rating`, `status`, `outcome`, `created_by_uuid`, `created_at`, `updated_at`) VALUES
(1, '924dac4b-6d78-412a-b236-134eeba41dc2', 1, '619c5d63-123d-4800-9365-bafa4086a178', 'fa4cd277-d475-11f1-942b-9840bb468dc0', '2026-10-07 20:41:00', 'phone', NULL, NULL, NULL, 'completed', 'passed', '352a7686-d473-11f1-942b-9840bb468dc0', '2026-10-30 20:41:59', '2026-10-30 20:47:04'),
(2, '4ea8dc12-8232-4839-aef1-1e28b095562e', 1, 'a69f4063-2603-4943-b0fc-5f4aac92d555', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-12 22:11:00', 'onsite', NULL, NULL, 5.00, 'completed', 'passed', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 22:11:29', '2026-10-30 22:12:39'),
(3, '2c5cf850-2dee-4558-ad9d-5b05a575ac74', 1, 'a5841d1f-3884-41a0-8c82-3884c864a861', '352a7686-d473-11f1-942b-9840bb468dc0', '2026-10-31 22:34:00', 'onsite', NULL, NULL, 5.00, 'completed', 'passed', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 22:35:06', '2026-10-30 22:35:19');

-- --------------------------------------------------------

--
-- Table structure for table `invite_tokens`
--

CREATE TABLE `invite_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_uuid` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL COMMENT 'SHA-256 hex of the raw token sent to user',
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `delivery_status` enum('pending','sent','failed') NOT NULL DEFAULT 'sent',
  `delivery_error` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `invite_tokens`
--

INSERT INTO `invite_tokens` (`id`, `user_uuid`, `token_hash`, `expires_at`, `used_at`, `delivery_status`, `delivery_error`, `created_at`) VALUES
(3, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '87450f73865bf86ca461717c5dd0fd944958dee6fc8fe2ac302ae4cea2e261dc', '2026-11-02 18:08:09', '2026-10-30 18:11:16', 'sent', NULL, '2026-10-30 18:08:09'),
(5, '743b85c2-d46a-11f1-942b-9840bb468dc0', 'ea6ff861959a7fa3eb7eb7ae8709208fbe2011af30647af6f4fc0d895e28ccee', '2026-11-02 19:03:09', '2026-10-30 19:04:13', 'sent', NULL, '2026-10-30 19:03:09'),
(6, '1f228ba4-d46c-11f1-942b-9840bb468dc0', '02677ff0c8c508bbde4c6406787d21d8c7f7b48c996c9dc59620ce7e9f826f6e', '2026-11-02 19:13:47', '2026-10-30 19:16:02', 'sent', NULL, '2026-10-30 19:13:47'),
(7, '352a7686-d473-11f1-942b-9840bb468dc0', '3785714a3d8a257d483e65066cef95580cb979e52c16d9719b4a714ea9c71eb7', '2026-11-02 20:04:31', '2026-10-30 20:06:09', 'sent', NULL, '2026-10-30 20:04:31'),
(8, 'fac36eca-d475-11f1-942b-9840bb468dc0', 'bf11dcd9d05da48000ca70346c90a3e49f46314713c9264abd6c129014d08b8c', '2026-11-02 20:24:21', NULL, 'sent', NULL, '2026-10-30 20:24:21'),
(10, 'c344496e-d489-11f1-942b-9840bb468dc0', '3df98e6011f52b488ead1bd72fb161fa5da5079d2ffdc387b8ff0729b1acb42b', '2026-11-02 22:47:14', '2026-10-30 22:48:49', 'sent', NULL, '2026-10-30 22:47:14');

-- --------------------------------------------------------

--
-- Table structure for table `job_openings`
--

CREATE TABLE `job_openings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `title` varchar(150) NOT NULL,
  `department_id` int(11) DEFAULT NULL,
  `designation_id` int(11) DEFAULT NULL,
  `location` varchar(120) DEFAULT NULL,
  `employment_type` enum('full_time','part_time','contract','internship','temporary') NOT NULL DEFAULT 'full_time',
  `description` text DEFAULT NULL,
  `status` enum('draft','open','closed') NOT NULL DEFAULT 'draft',
  `vacancies` smallint(5) UNSIGNED NOT NULL DEFAULT 1,
  `interview_required` tinyint(1) NOT NULL DEFAULT 0,
  `created_by_uuid` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `job_openings`
--

INSERT INTO `job_openings` (`id`, `uuid`, `organization_id`, `title`, `department_id`, `designation_id`, `location`, `employment_type`, `description`, `status`, `vacancies`, `interview_required`, `created_by_uuid`, `created_at`, `updated_at`) VALUES
(1, '81fe80d1-7e9b-4b3c-b393-b6ee148bd205', 1, 'Developer', 3, 2, 'Malir Karachi', 'full_time', 'tesitfihiuhuihdiufhsiuyuisydfiuyius', 'open', 20, 0, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 20:35:28', '2026-10-30 20:35:28'),
(2, '5e9d6478-bdd7-4d25-a296-21b88457b53f', 3, 'Developer', 4, 3, 'testing', 'full_time', 'Testing', 'open', 29, 0, 'c344496e-d489-11f1-942b-9840bb468dc0', '2026-10-30 22:55:16', '2026-10-30 22:55:16');

-- --------------------------------------------------------

--
-- Table structure for table `lead_status_history`
--

CREATE TABLE `lead_status_history` (
  `id` int(11) NOT NULL,
  `lead_type` enum('contact','access_request') NOT NULL,
  `lead_uuid` char(36) NOT NULL,
  `old_status` varchar(32) DEFAULT NULL,
  `new_status` varchar(32) NOT NULL,
  `notes` text DEFAULT NULL,
  `changed_by_admin_id` int(11) DEFAULT NULL,
  `changed_by_name` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `leave_requests`
--

CREATE TABLE `leave_requests` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `leave_type_id` bigint(20) UNSIGNED NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `reason` varchar(1000) DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `approved_by` char(36) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `requested_treatment` enum('paid','unpaid') NOT NULL DEFAULT 'unpaid',
  `approved_treatment` enum('paid','unpaid') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `leave_requests`
--

INSERT INTO `leave_requests` (`id`, `uuid`, `employee_uuid`, `leave_type_id`, `start_date`, `end_date`, `reason`, `status`, `approved_by`, `approved_at`, `created_at`, `requested_treatment`, `approved_treatment`) VALUES
(1, 'f531607a-d470-11f1-942b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 2, '2026-10-31', '2026-11-06', '**Subject: Sick Leave Application - [Your Name] - [Date]\n**Dear [Manager\'s Name],\nPlease accept this message as notification that I will be unable to work today, [Date], due to [brief reason, e.g., a sudden fever / severe stomach bug].\nI expect to return to work on [Expected Return Date]. I will make sure to catch up on pending tasks and check urgent emails if my condition improves.\n(Optional if medical certificate is attached): Please find my medical certificate attached.\nBest regards,\n[Your Name]\n[Your Designation / Department]', 'approved', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 19:50:00', '2026-10-30 19:48:25', 'paid', 'paid'),
(57, 'c7d5a6e7-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 2, '2026-10-13', '2026-10-14', 'Dummy paid leave for payroll testing', 'approved', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:40:20', '2026-11-01 18:40:20', 'paid', 'paid'),
(58, 'c7d604e9-d5f9-11f1-959b-9840bb468dc0', '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 1, '2026-10-21', '2026-10-22', 'Dummy unpaid sick leave for payroll testing', 'approved', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:40:20', '2026-11-01 18:40:20', 'unpaid', 'unpaid');

--
-- Triggers `leave_requests`
--
DELIMITER $$
CREATE TRIGGER `bi_leave_requests_uuid` BEFORE INSERT ON `leave_requests` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `leave_types`
--

CREATE TABLE `leave_types` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(100) NOT NULL,
  `days_allowed_per_year` int(11) NOT NULL DEFAULT 0,
  `is_paid` enum('yes','no') NOT NULL DEFAULT 'yes',
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `leave_types`
--

INSERT INTO `leave_types` (`id`, `organization_id`, `name`, `days_allowed_per_year`, `is_paid`, `created_at`) VALUES
(1, 1, 'Sick', 0, 'no', '2026-10-30 19:46:16'),
(2, 1, 'Anuual', 0, 'yes', '2026-10-30 19:46:40');

-- --------------------------------------------------------

--
-- Table structure for table `letter_templates`
--

CREATE TABLE `letter_templates` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `letter_type` enum('offer','increment','experience','employment_confirmation','warning','appreciation','custom') NOT NULL DEFAULT 'custom',
  `name` varchar(120) NOT NULL,
  `body` longtext NOT NULL,
  `merge_fields` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`merge_fields`)),
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by_uuid` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `letter_templates`
--

INSERT INTO `letter_templates` (`id`, `uuid`, `organization_id`, `letter_type`, `name`, `body`, `merge_fields`, `is_active`, `created_by_uuid`, `created_at`, `updated_at`) VALUES
(1, '67015b8f-623d-44bc-9f7e-284f5f75d82b', 1, 'offer', 'Offer Letter', 'Date: $letter_date\n\nRef No: $reference_no\n\nTo,\n\n$employee_name\nCNIC: $cnic\n\nSubject: Offer of Employment - $designation\n\nDear $employee_name,\n\nHumaray paas aap ke liye khushkhabri hai! $organization_name aap ko $designation ki position offer karte hue behad khushi mehsus kar raha hai. Aap ki appointment $department department me hogi.\nAap ki joining aur compensation ki Tafseelat (Details) neeche darj hain:\n\nDesignation: $designation\nDepartment: $department\nDate of Joining: $joining_date\nCurrent / Base Salary: $new_salary\nIssue Date: $issue_date\n\n(Note: Direct compensation $joining_date se lagu hogi aur payroll organization ki currency aur pay-frequency policy ke mutabiq manage kiya jaye ga.)\nAap ko jald hi ek detailed Employment Contract bheja jaye ga jis me terms & conditions, benefits, aur company policies ki mukammal tafseelat hongi.\nKharaye-karam is offer letter ko sign karke accept karein aur humein wapas send karein taake aap ka onboarding process shuru kiya ja sakay.\nHum aap ko $organization_name ki team me welcome karne ke liye pur-josh hain!\n\nSincerely,\n\nHuman Resources Department\n$organization_name\n\nAcceptance of Offer:\nMain is Offer Letter ki tamaam terms aur conditions ko samajhta/samajhti hoon aur is employment offer ko qabool karta/karti hoon.', '[\"letter_date\",\"reference_no\",\"employee_name\",\"cnic\",\"designation\",\"organization_name\",\"department\",\"joining_date\",\"new_salary\",\"issue_date\"]', 1, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 20:49:56', '2026-11-01 22:53:52');

--
-- Triggers `letter_templates`
--
DELIMITER $$
CREATE TRIGGER `bi_letter_templates_uuid` BEFORE INSERT ON `letter_templates` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `login_history`
--

CREATE TABLE `login_history` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL,
  `identity_type` enum('admin','user') NOT NULL,
  `identity_id` int(11) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(512) DEFAULT NULL,
  `login_at` datetime NOT NULL DEFAULT current_timestamp(),
  `success` enum('yes','no') NOT NULL DEFAULT 'no'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `login_history`
--

INSERT INTO `login_history` (`id`, `uuid`, `identity_type`, `identity_id`, `ip_address`, `user_agent`, `login_at`, `success`) VALUES
(1, '2ff30687-dc56-4103-8120-755d85d955ef', 'user', 1, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-30 18:11:41', 'yes'),
(2, 'bb21d392-a1f8-49c8-a931-63de9a6506d0', 'admin', 2, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-30 18:33:42', 'yes'),
(3, '45a5c085-438e-4023-9ff8-459bb355d87d', 'user', 2, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-30 19:04:20', 'no'),
(4, '60a314f7-2a04-4d41-9f5f-663ab98794c8', 'user', 2, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-30 19:04:23', 'no'),
(5, '8875420e-b922-4367-99c2-2058ce5628cc', 'user', 2, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-30 19:04:55', 'yes'),
(6, '85420867-7e2f-4aba-b5bb-fec80d5f42ab', 'user', 3, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-30 19:17:03', 'yes'),
(7, 'fe542ff9-1082-4a52-a47b-277d342ed359', 'user', 4, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-30 20:06:34', 'yes'),
(8, 'd83dd6d3-0d64-4562-a7da-cd4b4e24a7de', 'user', 6, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-30 22:49:06', 'yes'),
(9, '0e19d0bd-a0f2-46cc-8803-f9c7ec72f242', 'user', 3, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-31 01:14:18', 'no'),
(10, '0e3cfdf4-a1e7-4b95-9a23-85712e4a3283', 'user', 3, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-31 01:14:50', 'yes'),
(11, '30caa718-010c-472f-9d87-0f53a72b48fa', 'user', 3, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-31 12:39:43', 'yes'),
(12, '30b5aba6-9979-4eb2-b138-365ce6a7cc6a', 'user', 1, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-10-31 17:15:34', 'yes'),
(13, '3f81b964-a20b-4447-a9b7-f4cf5aa14bdb', 'user', 3, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-11-01 17:29:10', 'yes'),
(14, '8fe02745-3ed2-459d-a511-16faa48bfcec', 'user', 3, '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', '2026-11-01 20:16:01', 'yes');

-- --------------------------------------------------------

--
-- Table structure for table `login_otps`
--

CREATE TABLE `login_otps` (
  `id` int(11) NOT NULL,
  `identity_type` enum('admin','user') NOT NULL,
  `identity_id` int(11) NOT NULL,
  `otp_hash` varchar(128) NOT NULL,
  `attempts` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `login_otps`
--

INSERT INTO `login_otps` (`id`, `identity_type`, `identity_id`, `otp_hash`, `attempts`, `expires_at`, `used_at`, `created_at`) VALUES
(1, 'user', 1, '$2b$10$S9iFWT5F1rv7OidMfWZ/keqByNKpN7hbs3azQ7jeOq2EmefnJ/LBe', 1, '2026-10-30 18:16:22', '2026-10-30 18:11:41', '2026-10-30 18:11:22'),
(2, 'admin', 2, '$2a$12$mYXTIFPCvTYE9oRlbMNHXuWqSr.cUo7uJd1pDBqQxeTfQJA9RnKmu', 1, '2026-10-30 18:37:49', '2026-10-30 18:33:42', '2026-10-30 18:32:49'),
(3, 'user', 2, '$2b$10$CxYkOagyFeWnb9AJHJA0BOXrWzr9p6GAuQelwRE4dzigKevrJTtQq', 1, '2026-10-30 19:09:31', '2026-10-30 19:04:55', '2026-10-30 19:04:31'),
(4, 'user', 3, '$2b$10$mbBSxFbZ0XK17ywIQVdefez77O.Myl0ZR8aqK7d35/l.5zkkGepbm', 0, '2026-10-30 19:21:13', '2026-10-30 19:16:36', '2026-10-30 19:16:13'),
(5, 'user', 3, '$2b$10$sy3m.ImfzAvNQVcTHf4yoONagGn53HnjdWafGivwwhW.cx6f0s0W.', 1, '2026-10-30 19:21:36', '2026-10-30 19:17:03', '2026-10-30 19:16:36'),
(6, 'user', 4, '$2b$10$nZJlnGgldX9Glhnjq/khPOWvn77dgTE/.CvHI2TviQtSqZZ/sPeQK', 1, '2026-10-30 20:11:13', '2026-10-30 20:06:34', '2026-10-30 20:06:13'),
(7, 'user', 6, '$2b$10$dfDBZ7T1pLE2ebC3sZ8jPuvP.NGAqVGdnm.u.GREkgsgPq.fJS02u', 1, '2026-10-30 22:53:55', '2026-10-30 22:49:06', '2026-10-30 22:48:55'),
(8, 'user', 3, '$2b$10$V/eztTPwTB22jzuJU2bL7ugq1dT7BmnUVpzH4p8esQmZbyG5N4UOa', 1, '2026-10-31 01:19:24', '2026-10-31 01:14:50', '2026-10-31 01:14:24'),
(9, 'user', 3, '$2b$10$6RaDMcSeyqg.gRF3XRNRLOkABKlVKaDzQOvWEFFQUHMMic1djFDua', 1, '2026-10-31 12:44:02', '2026-10-31 12:39:43', '2026-10-31 12:39:02'),
(10, 'user', 1, '$2b$10$3dGEx4Bvt7IEAt0EDSn6m.s.sM/6WZB4rIlKMVw8Jcq65tIYyLAie', 1, '2026-10-31 17:20:10', '2026-10-31 17:15:33', '2026-10-31 17:15:10'),
(11, 'user', 3, '$2b$10$HA3rEeK0pivh8ZURjOqgE.B.ST4.l7Ks3Ml9ccqgewLqkfi4eO6oe', 1, '2026-11-01 17:33:55', '2026-11-01 17:29:10', '2026-11-01 17:28:55'),
(12, 'user', 3, '$2b$10$0hnqFjYQis8P97wVBZWu2.9jJGMswHbvfrtExk5JiP.u7AZTomOVq', 1, '2026-11-01 20:20:47', '2026-11-01 20:16:01', '2026-11-01 20:15:47');

-- --------------------------------------------------------

--
-- Table structure for table `monthly_salary_variables`
--

CREATE TABLE `monthly_salary_variables` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `label` varchar(150) NOT NULL,
  `type` enum('allowance','deduction') NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `month` tinyint(3) UNSIGNED NOT NULL,
  `year` smallint(5) UNSIGNED NOT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `monthly_salary_variables`
--

INSERT INTO `monthly_salary_variables` (`id`, `uuid`, `organization_id`, `employee_uuid`, `label`, `type`, `amount`, `month`, `year`, `created_by`, `created_at`) VALUES
(2, '909ea8c6-d61c-11f1-959b-9840bb468dc0', 1, '1ee2f46e-d46c-11f1-942b-9840bb468dc0', 'Attendance Bonus', 'allowance', 1000.00, 10, 2026, 1, '2026-11-01 22:49:07');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_uuid` char(36) NOT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'verification_request',
  `title` varchar(255) NOT NULL,
  `message` text DEFAULT NULL,
  `link` varchar(500) DEFAULT NULL,
  `reference_id` varchar(36) DEFAULT NULL COMMENT 'UUID of related entity (e.g. request uuid)',
  `read_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `user_uuid`, `type`, `title`, `message`, `link`, `reference_id`, `read_at`, `created_at`) VALUES
(1, '743b85c2-d46a-11f1-942b-9840bb468dc0', 'verification_request', 'New verification request', 'Arbaz Ali  sent a \"Experience Certificate\" document for your verification.', '/inbox', '777530e2-d46f-11f1-942b-9840bb468dc0', '2026-10-30 19:37:58', '2026-10-30 19:37:44'),
(2, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'request_verified', 'Request approved', 'Your \"Experience Certificate\" request was Approved by HTS.', '/requests', '777530e2-d46f-11f1-942b-9840bb468dc0', '2026-10-30 19:39:14', '2026-10-30 19:38:37'),
(3, '743b85c2-d46a-11f1-942b-9840bb468dc0', 'request_verified', 'Request approved', 'Your \"Experience Certificate\" request was approved automatically.', '/requests', 'd717aed7-d46f-11f1-942b-9840bb468dc0', NULL, '2026-10-30 19:40:32'),
(4, '743b85c2-d46a-11f1-942b-9840bb468dc0', 'verification_request', 'New verification request', 'Arbaz Ali  sent a \"Recommendation Letter\" document for your verification.', '/inbox', '470f959c-d470-11f1-942b-9840bb468dc0', '2026-10-30 19:43:48', '2026-10-30 19:43:32'),
(5, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'request_verified', 'Request rejected', 'Your \"Recommendation Letter\" request was Rejected by HTS.', '/requests', '470f959c-d470-11f1-942b-9840bb468dc0', '2026-10-30 20:00:49', '2026-10-30 19:44:03'),
(6, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'verification_request', 'New verification request', 'Hunain sent a \"Recommendation Letter\" document for your verification.', '/inbox', '6beacefa-d470-11f1-942b-9840bb468dc0', '2026-10-30 19:44:45', '2026-10-30 19:44:36'),
(7, '743b85c2-d46a-11f1-942b-9840bb468dc0', 'request_verified', 'Request rejected', 'Your \"Recommendation Letter\" request was Rejected by HakamTechSOl.', '/requests', '6beacefa-d470-11f1-942b-9840bb468dc0', NULL, '2026-10-30 19:45:08'),
(8, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'leave_request', 'New leave request', 'Hadi Ali requested 7 day(s) of Anuual leave.', '/org/leaves', 'f531607a-d470-11f1-942b-9840bb468dc0', '2026-10-30 19:49:18', '2026-10-30 19:48:25'),
(9, '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Anuual leave request (2026-10-31 → 2026-11-06) was approved.', '/leaves', 'f531607a-d470-11f1-942b-9840bb468dc0', '2026-10-30 19:50:07', '2026-10-30 19:50:00'),
(10, '99e25724-d504-11f1-80de-9840bb468dc0', 'leave_request', 'New leave request', 'UnpaidLeaveFlow 7 requested 2 day(s) of Unpaid Leave leave.', '/org/leaves', '9a2fd5ae-d504-11f1-80de-9840bb468dc0', NULL, '2026-10-31 13:25:16'),
(11, '9a2859da-d504-11f1-80de-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-07) was approved.', '/leaves', '9a2fd5ae-d504-11f1-80de-9840bb468dc0', NULL, '2026-10-31 13:25:16'),
(12, '99e25724-d504-11f1-80de-9840bb468dc0', 'leave_request', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '9a3e99da-d504-11f1-80de-9840bb468dc0', NULL, '2026-10-31 13:25:16'),
(13, '9a36c377-d504-11f1-80de-9840bb468dc0', 'leave_rejected', 'Leave rejected', 'Your Unpaid Leave leave request (2026-10-12 → 2026-10-12) was rejected.', '/leaves', '9a3e99da-d504-11f1-80de-9840bb468dc0', NULL, '2026-10-31 13:25:16'),
(14, '99e25724-d504-11f1-80de-9840bb468dc0', 'leave_request', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave.', '/org/leaves', '9a4ac91d-d504-11f1-80de-9840bb468dc0', NULL, '2026-10-31 13:25:17'),
(15, '9a4451ad-d504-11f1-80de-9840bb468dc0', 'leave_rejected', 'Leave rejected', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-07) was rejected.', '/leaves', '9a4ac91d-d504-11f1-80de-9840bb468dc0', NULL, '2026-10-31 13:25:17'),
(16, '99e25724-d504-11f1-80de-9840bb468dc0', 'leave_request', 'New leave request', 'PaidLeaveFlow 11 requested 1 day(s) of Sick Leave leave.', '/org/leaves', '9a5bec20-d504-11f1-80de-9840bb468dc0', NULL, '2026-10-31 13:25:17'),
(17, '9a57e157-d504-11f1-80de-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Sick Leave leave request (2026-10-12 → 2026-10-12) was approved.', '/leaves', '9a5bec20-d504-11f1-80de-9840bb468dc0', NULL, '2026-10-31 13:25:17'),
(18, '99e25724-d504-11f1-80de-9840bb468dc0', 'leave_request', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '9a684a28-d504-11f1-80de-9840bb468dc0', NULL, '2026-10-31 13:25:17'),
(19, '9a60ce7c-d504-11f1-80de-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-06) was approved.', '/leaves', '9a684a28-d504-11f1-80de-9840bb468dc0', NULL, '2026-10-31 13:25:17'),
(20, '7766a300-d52e-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '77bce94c-d52e-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:24:57'),
(21, '7766a300-d52e-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave.', '/org/leaves', '77c8efc1-d52e-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:24:58'),
(22, '7766a300-d52e-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '77d8db1d-d52e-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:24:58'),
(23, '77d02d6f-d52e-11f1-9f66-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-06) was approved.', '/leaves', '77d8db1d-d52e-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:24:58'),
(24, '8a580fe5-d52e-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '8abe3893-d52e-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:25:29'),
(25, '8a580fe5-d52e-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave.', '/org/leaves', '8acbc47e-d52e-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:25:29'),
(26, '8a580fe5-d52e-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '8adab246-d52e-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:25:30'),
(27, '8ad2e357-d52e-11f1-9f66-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-06) was approved.', '/leaves', '8adab246-d52e-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:25:30'),
(28, '9f007142-d52f-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '9f4fa353-d52f-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:33:13'),
(29, '9f007142-d52f-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave.', '/org/leaves', '9f58c91f-d52f-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:33:13'),
(30, '9f007142-d52f-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '9f66b225-d52f-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:33:13'),
(31, '9f5fd5d3-d52f-11f1-9f66-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-06) was approved.', '/leaves', '9f66b225-d52f-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:33:13'),
(32, '624fe83a-d532-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '62c32ee0-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:00'),
(33, '624fe83a-d532-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave.', '/org/leaves', '62cf6b60-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:00'),
(34, '62c905aa-d532-11f1-9f66-9840bb468dc0', 'leave_rejected', 'Leave rejected', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-07) was rejected.', '/leaves', '62cf6b60-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:00'),
(35, '624fe83a-d532-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'PaidLeaveFlow 11 requested 1 day(s) of Sick Leave leave.', '/org/leaves', '62d96953-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:00'),
(36, '62d6cbba-d532-11f1-9f66-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Sick Leave leave request (2026-10-12 → 2026-10-12) was approved.', '/leaves', '62d96953-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:00'),
(37, '624fe83a-d532-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '62e3ed1c-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:00'),
(38, '62ddf723-d532-11f1-9f66-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-06) was approved.', '/leaves', '62e3ed1c-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:00'),
(39, '75ff8b1a-d532-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '76632dd9-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:33'),
(40, '75ff8b1a-d532-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave.', '/org/leaves', '767053c7-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:33'),
(41, '7667cf7d-d532-11f1-9f66-9840bb468dc0', 'leave_rejected', 'Leave rejected', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-07) was rejected.', '/leaves', '767053c7-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:33'),
(42, '75ff8b1a-d532-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'PaidLeaveFlow 11 requested 1 day(s) of Sick Leave leave.', '/org/leaves', '7679e172-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:33'),
(43, '7676d41d-d532-11f1-9f66-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Sick Leave leave request (2026-10-12 → 2026-10-12) was approved.', '/leaves', '7679e172-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:33'),
(44, '75ff8b1a-d532-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', '76845d6c-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:33'),
(45, '767e776e-d532-11f1-9f66-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-06) was approved.', '/leaves', '76845d6c-d532-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 18:53:33'),
(46, '9fa578be-d533-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'RejectedLeave 8 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', 'a0393e09-d533-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 19:01:53'),
(47, '9fa578be-d533-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'InsufficientLeave 9 requested 2 day(s) of Unpaid Leave leave.', '/org/leaves', 'a06873cc-d533-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 19:01:53'),
(48, 'a055818b-d533-11f1-9f66-9840bb468dc0', 'leave_rejected', 'Leave rejected', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-07) was rejected.', '/leaves', 'a06873cc-d533-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 19:01:53'),
(49, '9fa578be-d533-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'PaidLeaveFlow 11 requested 1 day(s) of Sick Leave leave.', '/org/leaves', 'a07b438f-d533-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 19:01:53'),
(50, 'a0764015-d533-11f1-9f66-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Sick Leave leave request (2026-10-12 → 2026-10-12) was approved.', '/leaves', 'a07b438f-d533-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 19:01:53'),
(51, '9fa578be-d533-11f1-9f66-9840bb468dc0', 'leave_request', 'New leave request', 'AllocationEdit 12 requested 1 day(s) of Unpaid Leave leave.', '/org/leaves', 'a0920699-d533-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 19:01:53'),
(52, 'a08508d1-d533-11f1-9f66-9840bb468dc0', 'leave_approved', 'Leave approved', 'Your Unpaid Leave leave request (2026-10-06 → 2026-10-06) was approved.', '/leaves', 'a0920699-d533-11f1-9f66-9840bb468dc0', NULL, '2026-10-31 19:01:53');

-- --------------------------------------------------------

--
-- Table structure for table `notification_preferences`
--

CREATE TABLE `notification_preferences` (
  `user_uuid` char(36) NOT NULL,
  `email_leave` tinyint(1) NOT NULL DEFAULT 1,
  `email_support` tinyint(1) NOT NULL DEFAULT 1,
  `email_recruitment` tinyint(1) NOT NULL DEFAULT 1,
  `email_payroll` tinyint(1) NOT NULL DEFAULT 1,
  `email_attendance` tinyint(1) NOT NULL DEFAULT 1,
  `email_onboarding` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `offboarding_checklists`
--

CREATE TABLE `offboarding_checklists` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `exit_request_uuid` char(36) NOT NULL,
  `department` enum('IT','Finance','Assets','HR') NOT NULL,
  `task_name` varchar(200) NOT NULL,
  `status` enum('pending','cleared') NOT NULL DEFAULT 'pending',
  `cleared_by_uuid` char(36) DEFAULT NULL,
  `cleared_at` datetime DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `offboarding_clearance_templates`
--

CREATE TABLE `offboarding_clearance_templates` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `department` enum('IT','Finance','Assets','HR') NOT NULL,
  `task_name` varchar(200) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `organizations`
--

CREATE TABLE `organizations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `verified` enum('yes','no') NOT NULL DEFAULT 'no',
  `logo` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `organization_type` int(11) DEFAULT NULL,
  `subscription_status` enum('active','expired','none','pending_payment') NOT NULL DEFAULT 'none',
  `subscription_start` datetime DEFAULT NULL,
  `subscription_expiry` datetime DEFAULT NULL,
  `subscription_plan_id` bigint(20) UNSIGNED DEFAULT NULL,
  `pending_plan_id` bigint(20) UNSIGNED DEFAULT NULL,
  `reminder_2d_sent` enum('yes','no') DEFAULT 'no',
  `reminder_2h_sent` enum('yes','no') DEFAULT 'no',
  `business_email` varchar(190) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `last_expiry_reminder_sent` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `organizations`
--

INSERT INTO `organizations` (`id`, `uuid`, `name`, `verified`, `logo`, `created_at`, `organization_type`, `subscription_status`, `subscription_start`, `subscription_expiry`, `subscription_plan_id`, `pending_plan_id`, `reminder_2d_sent`, `reminder_2h_sent`, `business_email`, `deleted_at`, `last_expiry_reminder_sent`) VALUES
(1, 'b16ef552-d462-11f1-942b-9840bb468dc0', 'HakamTechSOl', 'yes', 'uploads/organizations/org_1793365578382_552873334.jfif', '2026-10-30 18:06:18', 2, 'active', '2026-10-30 18:06:18', '2026-11-30 18:53:01', 3, NULL, 'no', 'no', 'hunainhaider5566@gmail.com', NULL, NULL),
(2, '49a0d434-d46a-11f1-942b-9840bb468dc0', 'HTS', 'yes', 'uploads/organizations/org_1793368840190_475380.png', '2026-10-30 19:00:40', 2, 'active', '2026-10-30 19:00:40', '2026-11-30 19:42:32', 3, NULL, 'no', 'no', 'hunainhaidre78822@gmail.com', NULL, NULL),
(3, 'c2c4d075-d489-11f1-942b-9840bb468dc0', 'Dverif', 'yes', NULL, '2026-10-30 22:45:57', 2, 'active', '2026-10-30 22:45:57', '2026-11-30 22:50:09', 3, NULL, 'no', 'no', 'officeworks3244@gmail.com', NULL, NULL);

--
-- Triggers `organizations`
--
DELIMITER $$
CREATE TRIGGER `bi_organizations_uuid` BEFORE INSERT ON `organizations` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `organization_approval_policies`
--

CREATE TABLE `organization_approval_policies` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `strict_dual_control` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `organization_ip_rules`
--

CREATE TABLE `organization_ip_rules` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `ip_address` varchar(64) NOT NULL,
  `rule_type` enum('allow','deny') NOT NULL DEFAULT 'allow',
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `organization_ip_rules`
--

INSERT INTO `organization_ip_rules` (`id`, `organization_id`, `ip_address`, `rule_type`, `created_at`) VALUES
(1, 1, '36.255.32.248', 'allow', '2026-10-30 19:26:28');

-- --------------------------------------------------------

--
-- Table structure for table `organization_monthly_payroll_settings`
--

CREATE TABLE `organization_monthly_payroll_settings` (
  `organization_id` int(11) NOT NULL,
  `month` tinyint(3) UNSIGNED NOT NULL,
  `year` smallint(5) UNSIGNED NOT NULL,
  `salary_calculation_method` enum('hours','days') NOT NULL DEFAULT 'days',
  `calculate_overtime` tinyint(1) NOT NULL DEFAULT 0,
  `shift_start_time` time NOT NULL DEFAULT '09:00:00',
  `shift_end_time` time NOT NULL DEFAULT '17:00:00',
  `overtime_multiplier` decimal(5,2) NOT NULL DEFAULT 1.50,
  `updated_by_uuid` char(36) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

--
-- Dumping data for table `organization_monthly_payroll_settings`
--

INSERT INTO `organization_monthly_payroll_settings` (`organization_id`, `month`, `year`, `salary_calculation_method`, `calculate_overtime`, `shift_start_time`, `shift_end_time`, `overtime_multiplier`, `updated_by_uuid`, `updated_at`) VALUES
(1, 10, 2026, 'days', 1, '09:00:00', '17:00:00', 1.50, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-02 20:51:47'),
(1, 11, 2026, 'days', 1, '09:00:00', '17:00:00', 1.50, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-02 20:51:40');

-- --------------------------------------------------------

--
-- Table structure for table `organization_monthly_work_schedules`
--

CREATE TABLE `organization_monthly_work_schedules` (
  `id` bigint(20) NOT NULL,
  `organization_id` int(11) NOT NULL,
  `schedule_date` date NOT NULL,
  `day_type` enum('working','off') NOT NULL,
  `updated_by_uuid` char(36) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `organization_monthly_work_schedules`
--

INSERT INTO `organization_monthly_work_schedules` (`id`, `organization_id`, `schedule_date`, `day_type`, `updated_by_uuid`, `updated_at`) VALUES
(156, 1, '2026-10-01', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(157, 1, '2026-10-02', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(158, 1, '2026-10-03', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(159, 1, '2026-10-04', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(160, 1, '2026-10-05', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(161, 1, '2026-10-06', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(162, 1, '2026-10-07', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(163, 1, '2026-10-08', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(164, 1, '2026-10-09', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(165, 1, '2026-10-10', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(166, 1, '2026-10-11', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(167, 1, '2026-10-12', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(168, 1, '2026-10-13', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(169, 1, '2026-10-14', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(170, 1, '2026-10-15', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(171, 1, '2026-10-16', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(172, 1, '2026-10-17', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(173, 1, '2026-10-18', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(174, 1, '2026-10-19', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(175, 1, '2026-10-20', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(176, 1, '2026-10-21', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(177, 1, '2026-10-22', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(178, 1, '2026-10-23', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(179, 1, '2026-10-24', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(180, 1, '2026-10-25', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(181, 1, '2026-10-26', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(182, 1, '2026-10-27', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(183, 1, '2026-10-28', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(184, 1, '2026-10-29', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(185, 1, '2026-10-30', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(186, 1, '2026-10-31', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-31 19:22:08'),
(217, 1, '2026-11-01', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(218, 1, '2026-11-02', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(219, 1, '2026-11-03', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(220, 1, '2026-11-04', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(221, 1, '2026-11-05', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(222, 1, '2026-11-06', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(223, 1, '2026-11-07', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(224, 1, '2026-11-08', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(225, 1, '2026-11-09', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(226, 1, '2026-11-10', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(227, 1, '2026-11-11', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(228, 1, '2026-11-12', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(229, 1, '2026-11-13', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(230, 1, '2026-11-14', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(231, 1, '2026-11-15', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(232, 1, '2026-11-16', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(233, 1, '2026-11-17', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(234, 1, '2026-11-18', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(235, 1, '2026-11-19', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(236, 1, '2026-11-20', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(237, 1, '2026-11-21', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(238, 1, '2026-11-22', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(239, 1, '2026-11-23', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(240, 1, '2026-11-24', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(241, 1, '2026-11-25', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(242, 1, '2026-11-26', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(243, 1, '2026-11-27', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(244, 1, '2026-11-28', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(245, 1, '2026-11-29', 'off', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48'),
(246, 1, '2026-11-30', 'working', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 18:32:48');

-- --------------------------------------------------------

--
-- Table structure for table `organization_payroll_policies`
--

CREATE TABLE `organization_payroll_policies` (
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'PKR',
  `pay_frequency` enum('weekly','biweekly','semi_monthly','monthly') DEFAULT NULL,
  `daily_rate_basis` enum('actual_working_days','calendar_days','fixed_30') DEFAULT NULL,
  `hours_per_workday` decimal(5,2) DEFAULT NULL,
  `shift_start_time` time DEFAULT NULL,
  `late_grace_minutes` smallint(5) UNSIGNED DEFAULT NULL,
  `late_arrivals_per_penalty` smallint(5) UNSIGNED DEFAULT NULL,
  `late_penalty_days` decimal(5,2) DEFAULT NULL,
  `overtime_multiplier` decimal(5,2) DEFAULT NULL,
  `deduct_unpaid_leave` tinyint(1) DEFAULT NULL,
  `deduct_absences` tinyint(1) DEFAULT NULL,
  `deduct_late_arrivals` tinyint(1) DEFAULT NULL,
  `pay_approved_overtime` tinyint(1) DEFAULT NULL,
  `is_configured` tinyint(1) NOT NULL DEFAULT 0,
  `configured_by_uuid` char(36) DEFAULT NULL,
  `configured_at` datetime DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `organization_payroll_policies`
--

INSERT INTO `organization_payroll_policies` (`organization_id`, `currency`, `pay_frequency`, `daily_rate_basis`, `hours_per_workday`, `shift_start_time`, `late_grace_minutes`, `late_arrivals_per_penalty`, `late_penalty_days`, `overtime_multiplier`, `deduct_unpaid_leave`, `deduct_absences`, `deduct_late_arrivals`, `pay_approved_overtime`, `is_configured`, `configured_by_uuid`, `configured_at`, `updated_at`) VALUES
(1, 'PKR', 'monthly', 'fixed_30', 8.00, '08:00:00', 1, 1, 1.00, 1.00, 1, 1, 1, 1, 1, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-10-30 20:32:35', '2026-10-30 20:32:35');

-- --------------------------------------------------------

--
-- Table structure for table `organization_payroll_settings`
--

CREATE TABLE `organization_payroll_settings` (
  `organization_id` int(11) NOT NULL,
  `salary_calculation_method` enum('hours','days') NOT NULL DEFAULT 'days',
  `calculate_overtime` tinyint(1) NOT NULL DEFAULT 0,
  `shift_start_time` time NOT NULL DEFAULT '09:00:00',
  `shift_end_time` time NOT NULL DEFAULT '17:00:00',
  `overtime_multiplier` decimal(5,2) NOT NULL DEFAULT 1.50,
  `updated_by_uuid` char(36) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `organization_payroll_settings`
--

INSERT INTO `organization_payroll_settings` (`organization_id`, `salary_calculation_method`, `calculate_overtime`, `shift_start_time`, `shift_end_time`, `overtime_multiplier`, `updated_by_uuid`, `updated_at`) VALUES
(1, 'days', 1, '09:00:00', '17:00:00', 1.50, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-01 21:37:29');

-- --------------------------------------------------------

--
-- Table structure for table `organization_types`
--

CREATE TABLE `organization_types` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `organization_types`
--

INSERT INTO `organization_types` (`id`, `name`, `created_at`) VALUES
(1, 'educational', '2026-10-11 13:27:59'),
(2, 'software_house', '2026-10-17 17:22:52');

-- --------------------------------------------------------

--
-- Table structure for table `overtime_requests`
--

CREATE TABLE `overtime_requests` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `work_date` date NOT NULL,
  `requested_hours` decimal(5,2) NOT NULL DEFAULT 0.00,
  `approved_hours` decimal(5,2) NOT NULL DEFAULT 0.00,
  `reason` varchar(500) DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `decided_by` char(36) DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `decision_notes` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_tokens`
--

CREATE TABLE `password_reset_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_uuid` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL COMMENT 'SHA-256 hex of the raw token sent to user',
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment`
--

CREATE TABLE `payment` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `organization_id` bigint(20) UNSIGNED DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_method` varchar(50) NOT NULL DEFAULT 'manual',
  `transaction_reference` varchar(120) DEFAULT NULL,
  `refund_transaction_reference` varchar(255) DEFAULT NULL COMMENT 'Gateway reference for the refund, mirrored from the linked checkout for billing-history reconciliation',
  `refunded_at` datetime DEFAULT NULL COMMENT 'When the gateway confirmed the refund settled',
  `paid_at` datetime NOT NULL DEFAULT current_timestamp(),
  `purpose` varchar(200) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payment`
--

INSERT INTO `payment` (`id`, `uuid`, `user_id`, `organization_id`, `amount`, `payment_method`, `transaction_reference`, `refund_transaction_reference`, `refunded_at`, `paid_at`, `purpose`) VALUES
(1, '38560702-d469-11f1-942b-9840bb468dc0', 1, 1, 30000.00, 'safepay', 'track_bad52eb7-40bc-4623-a362-a431e66f5d25', NULL, NULL, '2026-10-30 18:53:01', 'Org subscription: Professional'),
(2, '2307142f-d470-11f1-942b-9840bb468dc0', 2, 2, 30000.00, 'safepay', 'track_5473a54c-8fb5-4599-ba23-0f7e7c45c15d', NULL, NULL, '2026-10-30 19:42:32', 'Org subscription: Professional'),
(3, '588321f8-d48a-11f1-942b-9840bb468dc0', 6, 3, 30000.00, 'safepay', 'track_396cac76-b02f-4548-85f6-ac47b68e2fcc', NULL, NULL, '2026-10-30 22:50:09', 'Org subscription: Professional');

--
-- Triggers `payment`
--
DELIMITER $$
CREATE TRIGGER `bi_payment_uuid` BEFORE INSERT ON `payment` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `persons`
--

CREATE TABLE `persons` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `cnic_encrypted` varchar(500) NOT NULL,
  `cnic_hash` char(64) NOT NULL,
  `full_name` varchar(200) DEFAULT NULL,
  `is_nadra_verified` enum('yes','no') NOT NULL DEFAULT 'no',
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `persons`
--

INSERT INTO `persons` (`id`, `uuid`, `cnic_encrypted`, `cnic_hash`, `full_name`, `is_nadra_verified`, `created_at`) VALUES
(1, '7779e9d6-d46f-11f1-942b-9840bb468dc0', 'v1:fjIvjROKGyVfkDNd:oDpJIPYp0t8DKRKajpLLdA==:PVeaMGDHBH9twFBaNg==', 'b5c7585e23ea4b2ea183b6b4c4da2647d5389104373668e19ad3839284b3dfc2', 'Hadi', 'no', '2026-10-30 19:37:44');

--
-- Triggers `persons`
--
DELIMITER $$
CREATE TRIGGER `bi_persons_uuid` BEFORE INSERT ON `persons` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `person_documents`
--

CREATE TABLE `person_documents` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `person_id` bigint(20) UNSIGNED NOT NULL,
  `document_type` varchar(100) DEFAULT NULL,
  `document_hash` varchar(64) DEFAULT NULL,
  `verified_by_organization_id` bigint(20) UNSIGNED DEFAULT NULL,
  `verified_by_verification_request_id` bigint(20) UNSIGNED DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `status` enum('verified','unverified') NOT NULL DEFAULT 'verified',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `document_extracted_name` varchar(200) DEFAULT NULL,
  `document_extracted_cnic_hash` char(64) DEFAULT NULL,
  `match_status` enum('not_checked','matched','mismatched') NOT NULL DEFAULT 'not_checked'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `person_documents`
--

INSERT INTO `person_documents` (`id`, `uuid`, `person_id`, `document_type`, `document_hash`, `verified_by_organization_id`, `verified_by_verification_request_id`, `verified_at`, `status`, `created_at`, `document_extracted_name`, `document_extracted_cnic_hash`, `match_status`) VALUES
(1, '96e4b7aa-d46f-11f1-942b-9840bb468dc0', 1, 'Experience Certificate', '0fb24cb416ba596657b71ad0c72eff4211f0584b7707278f6158276154d2bcd1', 2, 1, '2026-10-30 19:38:37', 'verified', '2026-10-30 19:38:37', 'Hunain Haider', NULL, 'mismatched'),
(2, 'db751807-d46f-11f1-942b-9840bb468dc0', 1, 'Experience Certificate', '0fb24cb416ba596657b71ad0c72eff4211f0584b7707278f6158276154d2bcd1', 1, 2, '2026-10-30 19:40:32', 'verified', '2026-10-30 19:40:32', 'Hunain Haider', NULL, 'mismatched');

--
-- Triggers `person_documents`
--
DELIMITER $$
CREATE TRIGGER `bi_person_documents_uuid` BEFORE INSERT ON `person_documents` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `refresh_tokens`
--

CREATE TABLE `refresh_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL COMMENT 'SHA-256 hex of the raw refresh JWT',
  `type` enum('user','admin') NOT NULL,
  `identifier` varchar(255) NOT NULL COMMENT 'user uuid or admin email',
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `refresh_tokens`
--

INSERT INTO `refresh_tokens` (`id`, `token_hash`, `type`, `identifier`, `expires_at`, `created_at`) VALUES
(63, 'f57e9798de7ab77eea217db323afab188964914f04cdd24235f6d2e94f494746', 'user', '1f228ba4-d46c-11f1-942b-9840bb468dc0', '2026-11-29 22:39:46', '2026-10-30 22:39:46'),
(64, '488e5ef45abc1592957a30b843fe01c3ee3a03905301f26c5d9d5b9b2fbe7468', 'user', '352a7686-d473-11f1-942b-9840bb468dc0', '2026-11-29 22:39:47', '2026-10-30 22:39:47'),
(65, '4ac38e03eaf98145b563af5e51fb9d8d9d72f469e8d38f068a9b6253d648a110', 'user', '743b85c2-d46a-11f1-942b-9840bb468dc0', '2026-11-29 22:39:47', '2026-10-30 22:39:47'),
(71, '02dda1051de128fbb5bdeb0a5939d6eb6ed4ec8c0b5ce8ca015c768e1ce04f67', 'user', 'c344496e-d489-11f1-942b-9840bb468dc0', '2026-11-29 23:00:25', '2026-10-30 23:00:25'),
(73, '517ff56353235c1df058ef4c53878631a5267e3b685217749ab4dd68258f98f6', 'admin', 'b16014ca-9bc5-11f1-a28a-9840bb468dc0', '2026-11-07 01:14:03', '2026-10-31 01:14:03'),
(76, '8d0cfa0963a0f73c965b7c5e16f38c8273aa0982c632aec020ab0350736f20be', 'user', '1f228ba4-d46c-11f1-942b-9840bb468dc0', '2026-11-30 01:46:15', '2026-10-31 01:46:15'),
(93, 'c8fc983cac1c4282ad1c42ab6ef53d853bc0f877326fb9ce5d3a42bc1f76cde7', 'user', '1f228ba4-d46c-11f1-942b-9840bb468dc0', '2026-11-30 15:07:14', '2026-10-31 15:07:14'),
(94, 'f3e90efd13aad447717713d01aa12c0b2f462f93a79d3663249c5d8610f5c9f1', 'user', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-11-30 15:07:43', '2026-10-31 15:07:43'),
(134, '06e68013f959cf9e7c99e0c739a5d08be19c13caf8cc51bc1435145f360f0527', 'user', '1f228ba4-d46c-11f1-942b-9840bb468dc0', '2026-12-01 19:36:45', '2026-11-01 19:36:45'),
(156, '49a4abf0224e03f405f724bbda04034e89ee8540a413649109c522127b965af6', 'user', '1f228ba4-d46c-11f1-942b-9840bb468dc0', '2026-12-01 23:34:41', '2026-11-01 23:34:42'),
(189, '49f61ba9f062ed5f5f00ac1edc65b131e664d417410d4067b1268f9e19bc651d', 'user', 'c5f55cb3-d462-11f1-942b-9840bb468dc0', '2026-12-02 21:31:41', '2026-11-02 21:31:41');

-- --------------------------------------------------------

--
-- Table structure for table `salary_components`
--

CREATE TABLE `salary_components` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(150) NOT NULL,
  `type` enum('allowance','deduction') NOT NULL,
  `is_percentage` tinyint(1) NOT NULL DEFAULT 0,
  `default_value` decimal(14,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `salary_components`
--

INSERT INTO `salary_components` (`id`, `uuid`, `organization_id`, `name`, `type`, `is_percentage`, `default_value`, `is_active`, `created_by`, `created_at`) VALUES
(1, '5e4719bb-d4a6-11f1-9047-9840bb468dc0', 1, 'Transport Allowance', 'allowance', 0, 3000.00, 1, 1, '2026-10-31 02:10:43'),
(90, 'c7d3409e-d5f9-11f1-959b-9840bb468dc0', 1, 'House Rent Allowance', 'allowance', 0, 5000.00, 1, NULL, '2026-11-01 18:40:20'),
(91, 'c7d36cc5-d5f9-11f1-959b-9840bb468dc0', 1, 'Medical Allowance', 'allowance', 0, 2000.00, 1, NULL, '2026-11-01 18:40:20'),
(92, 'c7d3c03e-d5f9-11f1-959b-9840bb468dc0', 1, 'Provident Fund', 'deduction', 0, 1000.00, 1, NULL, '2026-11-01 18:40:20'),
(93, 'c7d3efa6-d5f9-11f1-959b-9840bb468dc0', 1, 'Income Tax', 'deduction', 0, 500.00, 1, NULL, '2026-11-01 18:40:20'),
(94, '83f950b6-d61b-11f1-959b-9840bb468dc0', 1, 'Attendance Bonus', 'allowance', 0, 0.00, 1, 1, '2026-11-01 22:41:37'),
(95, '8aaed3d8-d61b-11f1-959b-9840bb468dc0', 1, 'Late Coming Deduction', 'deduction', 0, 0.00, 1, 1, '2026-11-01 22:41:48');

--
-- Triggers `salary_components`
--
DELIMITER $$
CREATE TRIGGER `bi_salary_components_uuid` BEFORE INSERT ON `salary_components` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `salary_records`
--

CREATE TABLE `salary_records` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `month` tinyint(3) UNSIGNED NOT NULL,
  `year` smallint(5) UNSIGNED NOT NULL,
  `basic_salary` decimal(14,2) NOT NULL DEFAULT 0.00,
  `allowances` decimal(14,2) NOT NULL DEFAULT 0.00,
  `deductions` decimal(14,2) NOT NULL DEFAULT 0.00,
  `expense_reimbursement` decimal(14,2) NOT NULL DEFAULT 0.00,
  `net_salary` decimal(14,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `salary_records`
--
DELIMITER $$
CREATE TRIGGER `bi_salary_records_uuid` BEFORE INSERT ON `salary_records` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `salary_record_lines`
--

CREATE TABLE `salary_record_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `salary_record_uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `employee_uuid` char(36) NOT NULL,
  `month` tinyint(3) UNSIGNED NOT NULL,
  `year` smallint(5) UNSIGNED NOT NULL,
  `label` varchar(150) NOT NULL,
  `type` enum('earning','deduction') NOT NULL,
  `source` enum('basic','component','monthly_variable','auto_unpaid_leave','auto_absenteeism','auto_late','auto_overtime','auto_expense','manual') NOT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `basis_value` decimal(10,2) DEFAULT NULL,
  `basis_unit` enum('days','hours','late_arrivals','claims') DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `schema_migrations`
--

CREATE TABLE `schema_migrations` (
  `id` int(11) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `checksum` char(32) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `schema_migrations`
--

INSERT INTO `schema_migrations` (`id`, `filename`, `checksum`, `applied_at`) VALUES
(119, '20261126_full_schema.sql', '9ff1129fe2bc0bc6d03c270f941fd6ad', '2026-10-13 17:42:42'),
(120, '20261018_add_employees_email_index.sql', '56c118ff02605c449c26714f1434d495', '2026-10-18 00:32:14'),
(121, '20261201_support_ticket_2tier.sql', '7e8e89020a228ddb736166dec0cbba08', '2026-10-26 14:03:42'),
(122, '20261208_designation_leave_policies.sql', '20ae77fefae842a41552cac7a16ae87f', '2026-10-26 14:03:42'),
(123, '20261209_support_ticket_department.sql', '22e2753f5de59acb0d764e6ed432d757', '2026-10-26 14:53:02'),
(124, '20261027_notification_email_outbox.sql', 'd108ec1bfec9552fe08c4400b86a4b33', '2026-10-27 16:05:57'),
(125, '20261210_employee_org_scoped_identity.sql', '4b25b77f2dc40d1d4fcb77b37e79871c', '2026-10-27 19:10:53'),
(126, '20261211_free_plan_user_management.sql', 'a0d1d63e7aceea46ef34a3883ba17da6', '2026-10-30 19:15:33');

-- --------------------------------------------------------

--
-- Table structure for table `self_subscription_requests`
--

CREATE TABLE `self_subscription_requests` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `plan_uuid` char(36) NOT NULL,
  `requested_by_uuid` char(36) NOT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `status` enum('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `decided_at` datetime DEFAULT NULL,
  `decided_by` char(36) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `self_subscription_requests`
--
DELIMITER $$
CREATE TRIGGER `bi_self_subscription_requests_uuid` BEFORE INSERT ON `self_subscription_requests` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `subscription_checkouts`
--

CREATE TABLE `subscription_checkouts` (
  `id` int(11) NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `plan_id` int(11) NOT NULL,
  `resulted_in_pending_plan_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'Plan this checkout scheduled via organizations.pending_plan_id; NULL when it applied immediately',
  `refund_status` enum('none','pending','refunded','failed') NOT NULL DEFAULT 'none' COMMENT 'none = never refunded; pending = submitted, settlement not yet confirmed; refunded = gateway-confirmed',
  `refund_transaction_reference` varchar(255) DEFAULT NULL COMMENT 'Gateway reference for the refund (e.g. Safepay refund_...); the traceable link back to the original charge',
  `refund_requested_at` datetime DEFAULT NULL COMMENT 'When the refund was submitted to the gateway',
  `refunded_at` datetime DEFAULT NULL COMMENT 'When the gateway confirmed the refund settled',
  `plan_uuid` char(36) NOT NULL,
  `plan_name` varchar(255) NOT NULL,
  `gateway` enum('safepay') NOT NULL DEFAULT 'safepay',
  `gateway_tracker_id` varchar(255) DEFAULT NULL,
  `gateway_event_id` varchar(255) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'PKR',
  `status` enum('pending','completed','failed','cancelled','refund_pending','refunded','expired') NOT NULL DEFAULT 'pending',
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `completed_at` datetime DEFAULT NULL,
  `failed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `subscription_checkouts`
--

INSERT INTO `subscription_checkouts` (`id`, `uuid`, `organization_id`, `plan_id`, `resulted_in_pending_plan_id`, `refund_status`, `refund_transaction_reference`, `refund_requested_at`, `refunded_at`, `plan_uuid`, `plan_name`, `gateway`, `gateway_tracker_id`, `gateway_event_id`, `amount`, `currency`, `status`, `metadata`, `created_at`, `updated_at`, `completed_at`, `failed_at`) VALUES
(1, 'dc0fdd4e-d468-11f1-942b-9840bb468dc0', 1, 3, NULL, 'none', NULL, NULL, NULL, 'aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0', 'Professional', 'safepay', NULL, NULL, 30000.00, 'PKR', 'cancelled', '{\"organization_id\":1,\"plan_uuid\":\"aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0\",\"plan_name\":\"Professional\",\"requested_by_uuid\":\"c5f55cb3-d462-11f1-942b-9840bb468dc0\",\"purpose\":\"change_plan\"}', '2026-10-30 18:50:26', '2026-10-30 18:50:47', NULL, NULL),
(2, 'e87998f0-d468-11f1-942b-9840bb468dc0', 1, 3, NULL, 'none', NULL, NULL, NULL, 'aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0', 'Professional', 'safepay', NULL, NULL, 30000.00, 'PKR', 'cancelled', '{\"organization_id\":1,\"plan_uuid\":\"aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0\",\"plan_name\":\"Professional\",\"requested_by_uuid\":\"c5f55cb3-d462-11f1-942b-9840bb468dc0\",\"purpose\":\"change_plan\"}', '2026-10-30 18:50:47', '2026-10-30 18:51:11', NULL, NULL),
(3, 'f67bd6f0-d468-11f1-942b-9840bb468dc0', 1, 3, NULL, 'none', NULL, NULL, NULL, 'aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0', 'Professional', 'safepay', 'track_bad52eb7-40bc-4623-a362-a431e66f5d25', 'reconcile-track_bad52eb7-40bc-4623-a362-a431e66f5d25', 30000.00, 'PKR', 'completed', '{\"organization_id\":1,\"plan_uuid\":\"aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0\",\"plan_name\":\"Professional\",\"requested_by_uuid\":\"c5f55cb3-d462-11f1-942b-9840bb468dc0\",\"purpose\":\"change_plan\"}', '2026-10-30 18:51:11', '2026-10-30 18:53:01', '2026-10-30 18:53:01', NULL),
(4, 'f6560a06-d46f-11f1-942b-9840bb468dc0', 2, 3, NULL, 'none', NULL, NULL, NULL, 'aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0', 'Professional', 'safepay', 'track_5473a54c-8fb5-4599-ba23-0f7e7c45c15d', 'reconcile-track_5473a54c-8fb5-4599-ba23-0f7e7c45c15d', 30000.00, 'PKR', 'completed', '{\"organization_id\":2,\"plan_uuid\":\"aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0\",\"plan_name\":\"Professional\",\"requested_by_uuid\":\"743b85c2-d46a-11f1-942b-9840bb468dc0\",\"purpose\":\"change_plan\"}', '2026-10-30 19:41:17', '2026-10-30 19:42:32', '2026-10-30 19:42:32', NULL),
(5, '3f20e24c-d48a-11f1-942b-9840bb468dc0', 3, 3, NULL, 'none', NULL, NULL, NULL, 'aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0', 'Professional', 'safepay', 'track_396cac76-b02f-4548-85f6-ac47b68e2fcc', 'reconcile-track_396cac76-b02f-4548-85f6-ac47b68e2fcc', 30000.00, 'PKR', 'completed', '{\"organization_id\":3,\"plan_uuid\":\"aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0\",\"plan_name\":\"Professional\",\"requested_by_uuid\":\"c344496e-d489-11f1-942b-9840bb468dc0\",\"purpose\":\"change_plan\"}', '2026-10-30 22:49:26', '2026-10-30 22:50:09', '2026-10-30 22:50:09', NULL);

--
-- Triggers `subscription_checkouts`
--
DELIMITER $$
CREATE TRIGGER `bi_subscription_checkouts_uuid` BEFORE INSERT ON `subscription_checkouts` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `subscription_plans`
--

CREATE TABLE `subscription_plans` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `name` varchar(120) NOT NULL,
  `monthly_price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `daily_request_quota` int(11) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `features` longtext DEFAULT NULL,
  `billing_period` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
  `is_public` tinyint(1) NOT NULL DEFAULT 0,
  `is_custom` tinyint(1) NOT NULL DEFAULT 0,
  `is_free` tinyint(1) NOT NULL DEFAULT 0,
  `is_recommended` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `module_flags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '{"employee_management":true,"attendance_management":true,"user_management":true,"leave_management":true,"payroll_management":true,"manpower_management":true,"recruitment_management":true,"onboarding_management":true,"separation_management":true,"training_management":true,"performance_management":true,"piece_work_management":true,"expense_management":true,"travel_management":true,"asset_management":true,"helpdesk_management":true,"scheduled_reports":true,"hr_letters_management":true}' CHECK (json_valid(`module_flags`)),
  `free_plan_guard` tinyint(3) UNSIGNED GENERATED ALWAYS AS (if(`is_free` = 1,1,NULL)) VIRTUAL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `subscription_plans`
--

INSERT INTO `subscription_plans` (`id`, `uuid`, `name`, `monthly_price`, `daily_request_quota`, `description`, `features`, `billing_period`, `is_public`, `is_custom`, `is_free`, `is_recommended`, `created_at`, `updated_at`, `module_flags`) VALUES
(1, '283d94ac-b8f6-11f1-ac00-9840bb468dc0', 'Free', 0.00, 0, NULL, '[{\"text\":\"1 request per day\",\"highlight\":true},{\"text\":\"Employee Management\",\"highlight\":true},{\"text\":\"Attendance Management\",\"highlight\":false},{\"text\":\"User Management\",\"highlight\":false},{\"text\":\"Leave Management\",\"highlight\":false},{\"text\":\"Payroll Management\",\"highlight\":false},{\"text\":\"Recruitment Management\",\"highlight\":false},{\"text\":\"Separation Management\",\"highlight\":false},{\"text\":\"Expense Management\",\"highlight\":false},{\"text\":\"Asset Management\",\"highlight\":false},{\"text\":\"HR Letters Management\",\"highlight\":false}]', 'monthly', 1, 0, 1, 0, '2026-09-25 20:31:20', '2026-10-30 19:15:33', '{\"employee_management\": true, \"attendance_management\": false, \"user_management\": true, \"leave_management\": false, \"payroll_management\": false, \"manpower_management\": false, \"recruitment_management\": false, \"onboarding_management\": false, \"separation_management\": false, \"training_management\": false, \"performance_management\": false, \"piece_work_management\": false, \"expense_management\": false, \"travel_management\": false, \"asset_management\": false, \"helpdesk_management\": false, \"scheduled_reports\": false, \"hr_letters_management\": false}'),
(2, '7bd51ede-b8f6-11f1-ac00-9840bb468dc0', 'Basic', 10000.00, 10, NULL, '[{\"text\":\"10 requests per day\",\"highlight\":true},{\"text\":\"Employee Management\",\"highlight\":true},{\"text\":\"Attendance Management\",\"highlight\":true},{\"text\":\"User Management\",\"highlight\":true},{\"text\":\"Leave Management\",\"highlight\":false},{\"text\":\"Payroll Management\",\"highlight\":false},{\"text\":\"Recruitment Management\",\"highlight\":true},{\"text\":\"Separation Management\",\"highlight\":true},{\"text\":\"Expense Management\",\"highlight\":true},{\"text\":\"Asset Management\",\"highlight\":true},{\"text\":\"HR Letters Management\",\"highlight\":true}]', 'monthly', 1, 0, 0, 0, '2026-09-25 20:33:40', '2026-10-30 18:49:25', '{\"employee_management\":true,\"attendance_management\":true,\"user_management\":true,\"leave_management\":false,\"payroll_management\":false,\"manpower_management\":true,\"recruitment_management\":true,\"onboarding_management\":true,\"separation_management\":true,\"training_management\":true,\"performance_management\":true,\"piece_work_management\":true,\"expense_management\":true,\"travel_management\":true,\"asset_management\":true,\"helpdesk_management\":true,\"scheduled_reports\":true,\"hr_letters_management\":true}'),
(3, 'aaf7b7e6-b8f6-11f1-ac00-9840bb468dc0', 'Professional', 30000.00, 100, NULL, '[{\"text\":\"100 requests per day\",\"highlight\":true},{\"text\":\"Employee Management\",\"highlight\":true},{\"text\":\"Attendance Management\",\"highlight\":true},{\"text\":\"User Management\",\"highlight\":true},{\"text\":\"Leave Management\",\"highlight\":true},{\"text\":\"Payroll Management\",\"highlight\":true},{\"text\":\"Recruitment Management\",\"highlight\":true},{\"text\":\"Separation Management\",\"highlight\":true},{\"text\":\"Expense Management\",\"highlight\":true},{\"text\":\"Asset Management\",\"highlight\":true},{\"text\":\"HR Letters Management\",\"highlight\":true}]', 'monthly', 1, 0, 0, 1, '2026-09-25 20:34:59', '2026-10-30 18:49:08', '{\"employee_management\":true,\"attendance_management\":true,\"user_management\":true,\"leave_management\":true,\"payroll_management\":true,\"manpower_management\":true,\"recruitment_management\":true,\"onboarding_management\":true,\"separation_management\":true,\"training_management\":true,\"performance_management\":true,\"piece_work_management\":true,\"expense_management\":true,\"travel_management\":true,\"asset_management\":true,\"helpdesk_management\":true,\"scheduled_reports\":true,\"hr_letters_management\":true}'),
(11, 'f020392d-ba78-11f1-8397-9840bb468dc0', 'Custom Plan — Pixel2pro', 50000.00, 1000, NULL, NULL, 'monthly', 0, 1, 0, 0, '2026-09-27 18:39:51', '2026-10-02 22:57:31', '{\"employee_management\": true, \"attendance_management\": true, \"user_management\": true, \"leave_management\": true, \"payroll_management\": true, \"manpower_management\": true, \"recruitment_management\": true, \"onboarding_management\": true, \"separation_management\": true, \"training_management\": true, \"performance_management\": true, \"piece_work_management\": true, \"expense_management\": true, \"travel_management\": true, \"asset_management\": true, \"helpdesk_management\": true, \"scheduled_reports\": true, \"hr_letters_management\": true}'),
(12, '68d1171a-bb54-11f1-b30c-9840bb468dc0', 'Custom Plan — HakamTechSol', 10000.00, 2000, NULL, NULL, 'monthly', 0, 1, 0, 0, '2026-09-28 20:51:03', '2026-10-02 22:57:31', '{\"employee_management\": true, \"attendance_management\": true, \"user_management\": true, \"leave_management\": true, \"payroll_management\": true, \"manpower_management\": true, \"recruitment_management\": true, \"onboarding_management\": true, \"separation_management\": true, \"training_management\": true, \"performance_management\": true, \"piece_work_management\": true, \"expense_management\": true, \"travel_management\": true, \"asset_management\": true, \"helpdesk_management\": true, \"scheduled_reports\": true, \"hr_letters_management\": true}');

--
-- Triggers `subscription_plans`
--
DELIMITER $$
CREATE TRIGGER `bi_subscription_plans_uuid` BEFORE INSERT ON `subscription_plans` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `support_tickets`
--

CREATE TABLE `support_tickets` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `department_id` int(11) DEFAULT NULL,
  `raised_by_uuid` char(36) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `category` enum('it','hr','admin','payroll') NOT NULL DEFAULT 'it',
  `priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
  `assigned_to_role` enum('org_admin','system_admin') NOT NULL DEFAULT 'org_admin',
  `assigned_to_uuid` char(36) DEFAULT NULL,
  `status` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `support_ticket_replies`
--

CREATE TABLE `support_ticket_replies` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `ticket_uuid` char(36) NOT NULL,
  `replied_by_uuid` char(36) NOT NULL,
  `replied_by_type` enum('admin','org_user') NOT NULL,
  `message` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `token_blacklist`
--

CREATE TABLE `token_blacklist` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL COMMENT 'SHA-256 hex of the raw JWT',
  `expires_at` datetime NOT NULL COMMENT 'Expiry of the blacklisted token',
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `unmatched_organizations`
--

CREATE TABLE `unmatched_organizations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `email` varchar(200) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `website` varchar(500) DEFAULT NULL,
  `status` enum('pending','contacted','converted','ignored') NOT NULL DEFAULT 'pending',
  `assigned_organization_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `unmatched_organizations`
--
DELIMITER $$
CREATE TRIGGER `bi_unmatched_orgs_uuid` BEFORE INSERT ON `unmatched_organizations` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(190) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `phone_normalized` varchar(20) DEFAULT NULL COMMENT 'Canonical national form of `phone`, derived by trigger. UNIQUE across live rows; NULL for soft-deleted or blank.',
  `password` varchar(255) NOT NULL,
  `cnic` varchar(30) DEFAULT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `org_role` enum('org_admin','sub_admin','employee') NOT NULL DEFAULT 'employee',
  `preferred_language` enum('en','ur') NOT NULL DEFAULT 'en',
  `organization` bigint(20) UNSIGNED DEFAULT NULL,
  `profile_image` varchar(500) DEFAULT NULL,
  `is_verified` enum('yes','no') NOT NULL DEFAULT 'no',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `feature_access` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`feature_access`)),
  `deleted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `uuid`, `full_name`, `email`, `phone`, `phone_normalized`, `password`, `cnic`, `status`, `org_role`, `preferred_language`, `organization`, `profile_image`, `is_verified`, `created_at`, `feature_access`, `deleted_at`) VALUES
(1, 'c5f55cb3-d462-11f1-942b-9840bb468dc0', 'Arbaz Ali ', 'hunainhaider5566@gmail.com', '03182484396', '3182484396', '$2b$12$u8SycTelR2td0Kce7bo.0OE46MgtxEMe27IuUnY.L5DNy7XtTVAS6', '4253762768762', 'active', 'org_admin', 'en', 1, NULL, 'yes', '2026-10-30 18:06:52', NULL, NULL),
(2, '743b85c2-d46a-11f1-942b-9840bb468dc0', 'Hunain', 'hunainhaidre78822@gmail.com', '03182484322', '3182484322', '$2b$12$urZFk/cAuO1QYB9FQijoq.pYNAZNkOeUKlGOKJIZI.fTGFWE3YZ8q', '4235676584398', 'active', 'org_admin', 'en', 2, NULL, 'yes', '2026-10-30 19:01:51', NULL, NULL),
(3, '1f228ba4-d46c-11f1-942b-9840bb468dc0', 'Hadi Ali', 'hunainhaider811@gmail.com', '03182484933', '3182484933', '$2b$12$5fKTt.TQZXeLz5ai6Whxt.ZQ0pC8P1i1klMvlh45rkgqhxIIbibHu', '4250173883487', 'active', 'employee', 'en', 1, NULL, 'yes', '2026-10-30 19:13:47', NULL, NULL),
(4, '352a7686-d473-11f1-942b-9840bb468dc0', 'Tooba', 'toobafatima811@gmail.com', '03182484876', '3182484876', '$2b$12$7bCjLEAALD4cwJFpe0kKGefP68vj/qyOEwaNEyWMcayn487W4WWfW', '4255983983004', 'active', 'sub_admin', 'en', 1, NULL, 'yes', '2026-10-30 20:04:31', '{\"attendance\":true,\"leave\":true,\"payroll\":true,\"manage_employees\":true,\"generate_request\":true,\"approve_request\":true,\"hr_letters\":true,\"manage_assets\":true,\"manage_separation\":true,\"approve_expenses\":true,\"manage_recruitment\":true}', NULL),
(5, 'fac36eca-d475-11f1-942b-9840bb468dc0', 'testing', 'testing1@gmail.com', '03182484936', '3182484936', '$2b$12$/8z7Rhd6TilHQhIrIkVYNeKbcfYvXnrt0CwIeW5bJYTyTpt403Ewy', '4235656534673', 'inactive', 'employee', 'en', 1, NULL, 'no', '2026-10-30 20:24:21', NULL, NULL),
(6, 'c344496e-d489-11f1-942b-9840bb468dc0', 'Office ', 'officeworks3244@gmail.com', '03182484333', '3182484333', '$2b$12$yOgjLLCHtx4x3FLSmJ7KD.DLuj0OoimhD723sCfyiIi2qMUDBp0TC', '3626826876287', 'active', 'org_admin', 'en', 3, NULL, 'yes', '2026-10-30 22:45:58', NULL, NULL);

--
-- Triggers `users`
--
DELIMITER $$
CREATE TRIGGER `bi_users_phone_normalize` BEFORE INSERT ON `users` FOR EACH ROW BEGIN
  SET NEW.phone_normalized = dverif_normalize_phone(NEW.phone, NEW.deleted_at);
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `bi_users_uuid` BEFORE INSERT ON `users` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `bu_users_phone_normalize` BEFORE UPDATE ON `users` FOR EACH ROW BEGIN
  SET NEW.phone_normalized = dverif_normalize_phone(NEW.phone, NEW.deleted_at);
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `verification_requests`
--

CREATE TABLE `verification_requests` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `document_type` varchar(100) NOT NULL,
  `issuing_organization_id` bigint(20) UNSIGNED DEFAULT NULL,
  `unmatched_org_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` enum('under_review','verified','auto_verified','unverified') NOT NULL DEFAULT 'under_review',
  `submitted_at` datetime NOT NULL DEFAULT current_timestamp(),
  `verified_at` datetime DEFAULT NULL,
  `document_path` varchar(500) NOT NULL,
  `document_format` enum('pdf','jpeg') NOT NULL,
  `document_owner_name` varchar(200) DEFAULT NULL,
  `linked_person_id` bigint(20) UNSIGNED DEFAULT NULL,
  `organization_conserned_for_future` enum('yes','no') NOT NULL DEFAULT 'no',
  `submission_remarks` varchar(500) DEFAULT NULL,
  `verification_remarks` varchar(500) DEFAULT NULL,
  `verified_by` bigint(20) UNSIGNED DEFAULT NULL,
  `verification_method` enum('manual','portal','auto','admin','automatic_match') NOT NULL DEFAULT 'manual',
  `locked_by` bigint(20) UNSIGNED DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `document_hash` varchar(64) DEFAULT NULL,
  `document_validation_status` enum('passed','flagged','unvalidated') NOT NULL DEFAULT 'passed' COMMENT 'Automated document check: passed (structural checks clean), flagged (a heuristic quality signal fired) or unvalidated (service unreachable, checked nothing)',
  `document_validation_reason` varchar(500) DEFAULT NULL COMMENT 'Message from the document validation service when status = flagged',
  `qr_token` varchar(64) DEFAULT NULL,
  `qr_signature` varchar(128) DEFAULT NULL,
  `sla_reminder_sent_at` datetime DEFAULT NULL,
  `sla_flagged_at` datetime DEFAULT NULL,
  `match_status` enum('not_attempted','auto_matched','manual_review','no_reference_found') NOT NULL DEFAULT 'not_attempted',
  `match_confidence` decimal(5,2) DEFAULT NULL,
  `matched_employee_document_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `verification_requests`
--

INSERT INTO `verification_requests` (`id`, `uuid`, `user_id`, `document_type`, `issuing_organization_id`, `unmatched_org_id`, `status`, `submitted_at`, `verified_at`, `document_path`, `document_format`, `document_owner_name`, `linked_person_id`, `organization_conserned_for_future`, `submission_remarks`, `verification_remarks`, `verified_by`, `verification_method`, `locked_by`, `locked_at`, `created_at`, `document_hash`, `document_validation_status`, `document_validation_reason`, `qr_token`, `qr_signature`, `sla_reminder_sent_at`, `sla_flagged_at`, `match_status`, `match_confidence`, `matched_employee_document_id`) VALUES
(1, '777530e2-d46f-11f1-942b-9840bb468dc0', 1, 'Experience Certificate', 2, NULL, 'verified', '2026-10-30 19:37:44', '2026-10-30 19:38:34', '/uploads/documents/doc_1793371063174_186227815.pdf', 'pdf', 'Hadi', 1, 'no', NULL, 'This doc has  been approved by HTS', 2, 'portal', NULL, NULL, '2026-10-30 19:37:44', '0fb24cb416ba596657b71ad0c72eff4211f0584b7707278f6158276154d2bcd1', 'flagged', 'Page 2 content extends 2.0pt beyond the visible page — the document looks cropped', 'b8401e59c356a056dcedfb3586a15fcd8d280f4740b41436cc91285ea9cf656e', '5b36ece75c110cd050d07d887010e74cad34bc35e0f209127f049b0fe012abc5', NULL, NULL, 'no_reference_found', NULL, NULL),
(2, 'd717aed7-d46f-11f1-942b-9840bb468dc0', 2, 'Experience Certificate', 1, NULL, 'auto_verified', '2026-10-30 19:40:25', '2026-10-30 19:40:28', '/uploads/documents/doc_1793371224689_456852746.pdf', 'pdf', 'Hadi Ali', 1, 'no', NULL, NULL, NULL, 'automatic_match', NULL, NULL, '2026-10-30 19:40:25', '0fb24cb416ba596657b71ad0c72eff4211f0584b7707278f6158276154d2bcd1', 'flagged', 'Page 2 content extends 2.0pt beyond the visible page — the document looks cropped', '9b154ad14623410c77692dcc4281c2ea7d4f327e69d55444239343369e675cfc', '7d718ad71eeba7fdde9e8f35f24cb01f9bb988f2e61fc542d97ef1a60a69da59', NULL, NULL, 'auto_matched', 100.00, 1),
(3, '470f959c-d470-11f1-942b-9840bb468dc0', 1, 'Recommendation Letter', 2, NULL, 'unverified', '2026-10-30 19:43:32', '2026-10-30 19:44:03', '/uploads/documents/doc_1793371411171_709187261.pdf', 'pdf', 'Hadi Ali', 1, 'no', NULL, 'Not Real Doc', 2, 'portal', NULL, NULL, '2026-10-30 19:43:32', 'd40af15173e14de9bc89cb5926799a0547f6d16c4c984646e8bd7999719a2c8f', 'passed', NULL, NULL, NULL, NULL, NULL, 'no_reference_found', NULL, NULL),
(4, '6beacefa-d470-11f1-942b-9840bb468dc0', 2, 'Recommendation Letter', 1, NULL, 'unverified', '2026-10-30 19:44:34', '2026-10-30 19:45:08', '/uploads/documents/doc_1793371474323_895348923.pdf', 'pdf', 'Hadi Ali', 1, 'no', NULL, 'Not Real Doc', 1, 'portal', NULL, NULL, '2026-10-30 19:44:34', 'd40af15173e14de9bc89cb5926799a0547f6d16c4c984646e8bd7999719a2c8f', 'passed', NULL, NULL, NULL, NULL, NULL, 'manual_review', 0.00, 1);

--
-- Triggers `verification_requests`
--
DELIMITER $$
CREATE TRIGGER `bi_verification_requests_uuid` BEFORE INSERT ON `verification_requests` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `workflow_definitions`
--

CREATE TABLE `workflow_definitions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `module_key` varchar(60) NOT NULL,
  `entity_type` varchar(60) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_by_uuid` char(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `workflow_definitions`
--
DELIMITER $$
CREATE TRIGGER `bi_workflow_definitions_uuid` BEFORE INSERT ON `workflow_definitions` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `workflow_steps`
--

CREATE TABLE `workflow_steps` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `workflow_id` bigint(20) UNSIGNED NOT NULL,
  `step_order` smallint(5) UNSIGNED NOT NULL,
  `name` varchar(120) NOT NULL,
  `approver_type` enum('org_admin','sub_admin','specific_user','reporting_manager') NOT NULL,
  `approver_uuid` char(36) DEFAULT NULL,
  `required_approvals` smallint(5) UNSIGNED NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `workflow_steps`
--
DELIMITER $$
CREATE TRIGGER `bi_workflow_steps_uuid` BEFORE INSERT ON `workflow_steps` FOR EACH ROW BEGIN
  IF NEW.`uuid` IS NULL OR NEW.`uuid` = '' THEN
    SET NEW.`uuid` = UUID();
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `work_week_config`
--

CREATE TABLE `work_week_config` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `mon` tinyint(1) NOT NULL DEFAULT 1,
  `tue` tinyint(1) NOT NULL DEFAULT 1,
  `wed` tinyint(1) NOT NULL DEFAULT 1,
  `thu` tinyint(1) NOT NULL DEFAULT 1,
  `fri` tinyint(1) NOT NULL DEFAULT 1,
  `sat` tinyint(1) NOT NULL DEFAULT 0,
  `sun` tinyint(1) NOT NULL DEFAULT 0,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `work_week_config`
--

INSERT INTO `work_week_config` (`id`, `organization_id`, `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`, `updated_by`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 1, 1, 1, 1, 0, 0, NULL, '2026-10-30 20:32:35', '2026-10-30 20:32:35');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `access_requests`
--
ALTER TABLE `access_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uuid` (`uuid`),
  ADD KEY `idx_access_requests_status` (`status`);

--
-- Indexes for table `admin_password_reset_tokens`
--
ALTER TABLE `admin_password_reset_tokens`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_aprt_admin_uuid` (`admin_uuid`),
  ADD KEY `idx_aprt_token_hash` (`token_hash`);

--
-- Indexes for table `admin_profiles`
--
ALTER TABLE `admin_profiles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_admin_profiles_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_admin_profiles_email` (`email`),
  ADD KEY `idx_admin_profiles_uuid` (`uuid`);

--
-- Indexes for table `approval_requests`
--
ALTER TABLE `approval_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_approval_requests_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_approval_requests_one_live` (`organization_id`,`entity_type`,`live_entity_uuid`),
  ADD KEY `idx_approval_requests_entity` (`organization_id`,`entity_type`,`entity_uuid`),
  ADD KEY `idx_approval_requests_pending` (`organization_id`,`status`,`current_step_order`),
  ADD KEY `idx_approval_requests_requester` (`requested_by_uuid`),
  ADD KEY `fk_approval_requests_workflow` (`workflow_id`),
  ADD KEY `fk_approval_requests_resolver` (`resolved_by_uuid`);

--
-- Indexes for table `approval_step_history`
--
ALTER TABLE `approval_step_history`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_approval_step_history_uuid` (`uuid`),
  ADD KEY `idx_approval_step_history_request` (`approval_request_uuid`,`step_order`,`acted_at`),
  ADD KEY `idx_approval_step_history_approver` (`approver_uuid`),
  ADD KEY `fk_approval_step_history_step` (`step_id`);

--
-- Indexes for table `assets`
--
ALTER TABLE `assets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_assets_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_assets_org_tag` (`organization_id`,`asset_tag`),
  ADD UNIQUE KEY `uk_assets_single_holder` (`active_assignment_guard`),
  ADD KEY `idx_assets_org_status` (`organization_id`,`status`),
  ADD KEY `idx_assets_serial` (`organization_id`,`serial_number`),
  ADD KEY `idx_assets_purchase_date` (`organization_id`,`purchase_date`),
  ADD KEY `fk_assets_creator` (`created_by_uuid`);

--
-- Indexes for table `asset_assignments`
--
ALTER TABLE `asset_assignments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_asset_assignments_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_asset_assignments_open` (`asset_uuid`,`open_assignment_guard`),
  ADD KEY `idx_asset_assignments_employee` (`organization_id`,`employee_uuid`),
  ADD KEY `idx_asset_assignments_asset` (`asset_uuid`,`assigned_at`),
  ADD KEY `fk_asset_assignments_employee` (`employee_uuid`),
  ADD KEY `fk_asset_assignments_assigner` (`assigned_by_uuid`),
  ADD KEY `fk_asset_assignments_returner` (`returned_to_uuid`);

--
-- Indexes for table `asset_maintenance`
--
ALTER TABLE `asset_maintenance`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_asset_maintenance_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_asset_maintenance_open` (`asset_uuid`,`open_job_guard`),
  ADD KEY `idx_asset_maintenance_org` (`organization_id`,`status`),
  ADD KEY `idx_asset_maintenance_asset` (`asset_uuid`,`reported_at`),
  ADD KEY `fk_asset_maintenance_reporter` (`reported_by_uuid`),
  ADD KEY `fk_asset_maintenance_finisher` (`completed_by_uuid`);

--
-- Indexes for table `attachments`
--
ALTER TABLE `attachments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_attachments_uuid` (`uuid`),
  ADD KEY `idx_attachments_entity` (`organization_id`,`entity_type`,`entity_uuid`),
  ADD KEY `idx_attachments_uploader` (`uploaded_by_uuid`),
  ADD KEY `idx_attachments_category` (`organization_id`,`entity_type`,`category`);

--
-- Indexes for table `attendance_records`
--
ALTER TABLE `attendance_records`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_attendance_employee_date` (`employee_uuid`,`date`),
  ADD KEY `idx_attendance_org_date` (`organization_id`,`date`),
  ADD KEY `idx_attendance_employee` (`employee_uuid`);

--
-- Indexes for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_audit_logs_uuid` (`uuid`),
  ADD KEY `idx_audit_actor` (`actor_type`,`actor_id`),
  ADD KEY `idx_audit_action` (`action`),
  ADD KEY `idx_audit_entity` (`entity_type`,`entity_id`),
  ADD KEY `idx_audit_date` (`created_at`),
  ADD KEY `idx_audit_actor_date` (`actor_type`,`created_at`),
  ADD KEY `idx_audit_action_date` (`action`,`created_at`);

--
-- Indexes for table `candidates`
--
ALTER TABLE `candidates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_candidates_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_candidates_org_uuid` (`organization_id`,`uuid`),
  ADD KEY `idx_candidates_opening_stage` (`organization_id`,`job_opening_uuid`,`stage`),
  ADD KEY `idx_candidates_org_stage` (`organization_id`,`stage`,`created_at`),
  ADD KEY `fk_candidates_converted_employee` (`converted_employee_uuid`),
  ADD KEY `idx_candidates_offer_status` (`organization_id`,`offer_status`,`updated_at`),
  ADD KEY `fk_candidates_interview_override_by` (`failed_interview_override_by_uuid`),
  ADD KEY `idx_candidates_opening_email` (`organization_id`,`job_opening_uuid`,`email`);

--
-- Indexes for table `contact_leads`
--
ALTER TABLE `contact_leads`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uuid` (`uuid`),
  ADD KEY `idx_contact_leads_status` (`status`);

--
-- Indexes for table `custom_plan_requests`
--
ALTER TABLE `custom_plan_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_custom_plan_requests_uuid` (`uuid`),
  ADD KEY `idx_custom_plan_requests_org` (`organization_id`),
  ADD KEY `idx_custom_plan_requests_status` (`status`),
  ADD KEY `fk_cpr_org_idx` (`organization_id`),
  ADD KEY `idx_cpr_approved_plan` (`approved_plan_id`);

--
-- Indexes for table `daily_request_usage`
--
ALTER TABLE `daily_request_usage`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_daily_usage_org_date` (`organization_id`,`date`),
  ADD KEY `fk_dru_org_idx` (`organization_id`);

--
-- Indexes for table `departments`
--
ALTER TABLE `departments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_departments_uuid` (`uuid`),
  ADD UNIQUE KEY `uq_departments_org_name` (`organization_id`,`name`),
  ADD UNIQUE KEY `uk_departments_org_id` (`organization_id`,`id`),
  ADD KEY `idx_departments_org` (`organization_id`);

--
-- Indexes for table `designations`
--
ALTER TABLE `designations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_designations_uuid` (`uuid`),
  ADD UNIQUE KEY `uq_designations_org_name` (`organization_id`,`name`),
  ADD UNIQUE KEY `uk_designations_org_id` (`organization_id`,`id`),
  ADD KEY `idx_designations_org` (`organization_id`);

--
-- Indexes for table `designation_leave_policies`
--
ALTER TABLE `designation_leave_policies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_dlp_uuid` (`uuid`),
  ADD UNIQUE KEY `uq_dlp_policy` (`organization_id`,`designation_id`,`leave_type_id`,`year`),
  ADD KEY `idx_dlp_designation_year` (`designation_id`,`year`),
  ADD KEY `fk_dlp_leave_type` (`leave_type_id`);

--
-- Indexes for table `document_types`
--
ALTER TABLE `document_types`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_document_types_name` (`name`),
  ADD UNIQUE KEY `uq_document_types_label_key` (`label_key`),
  ADD KEY `idx_document_types_active` (`is_active`,`sort_order`);

--
-- Indexes for table `email_outbox`
--
ALTER TABLE `email_outbox`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_email_outbox_event_key` (`event_key`),
  ADD KEY `idx_email_outbox_delivery` (`status`,`available_at`,`id`),
  ADD KEY `idx_email_outbox_user` (`user_uuid`,`created_at`);

--
-- Indexes for table `employees`
--
ALTER TABLE `employees`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_employees_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_employees_org_code` (`organization_id`,`employee_code`),
  ADD UNIQUE KEY `uq_employees_org_active_cnic` (`organization_id`,`active_cnic`),
  ADD UNIQUE KEY `uq_employees_org_active_email` (`organization_id`,`active_email`),
  ADD KEY `idx_employees_org` (`organization_id`),
  ADD KEY `idx_employees_linked_user` (`linked_user_uuid`),
  ADD KEY `fk_emp_org_idx` (`organization_id`),
  ADD KEY `fk_emp_added_by_idx` (`added_by_uuid`),
  ADD KEY `fk_emp_linked_user_idx` (`linked_user_uuid`),
  ADD KEY `fk_emp_promoted_by_idx` (`promoted_by_uuid`),
  ADD KEY `fk_employee_designation` (`designation_id`),
  ADD KEY `fk_employee_department` (`department_id`),
  ADD KEY `idx_employees_reporting_manager` (`reporting_manager_uuid`),
  ADD KEY `idx_employees_email` (`email`),
  ADD KEY `idx_employees_cnic` (`cnic`);

--
-- Indexes for table `employee_documents`
--
ALTER TABLE `employee_documents`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_employee_documents_uuid` (`uuid`),
  ADD KEY `idx_employee_documents_emp` (`employee_uuid`),
  ADD KEY `idx_emp_docs_hash` (`document_hash`),
  ADD KEY `idx_emp_docs_extraction` (`extraction_status`);

--
-- Indexes for table `employee_leave_allocations`
--
ALTER TABLE `employee_leave_allocations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_ela` (`employee_uuid`,`leave_type_id`,`year`),
  ADD KEY `idx_ela_employee_year` (`employee_uuid`,`year`),
  ADD KEY `fk_ela_type` (`leave_type_id`);

--
-- Indexes for table `employee_salary_components`
--
ALTER TABLE `employee_salary_components`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_esc_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_esc_employee_component` (`employee_uuid`,`salary_component_id`),
  ADD KEY `idx_esc_employee` (`employee_uuid`),
  ADD KEY `idx_esc_component` (`salary_component_id`);

--
-- Indexes for table `employee_salary_history`
--
ALTER TABLE `employee_salary_history`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_esh_uuid` (`uuid`),
  ADD KEY `idx_esh_employee` (`employee_uuid`),
  ADD KEY `idx_esh_active` (`employee_uuid`,`effective_from`,`effective_to`),
  ADD KEY `fk_esh_created_by` (`created_by`);

--
-- Indexes for table `exit_requests`
--
ALTER TABLE `exit_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_exit_requests_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_exit_requests_open` (`employee_uuid`,`open_exit_guard`),
  ADD KEY `idx_exit_requests_org_status` (`organization_id`,`status`),
  ADD KEY `idx_exit_requests_employee` (`organization_id`,`employee_uuid`),
  ADD KEY `idx_exit_requests_lwd` (`organization_id`,`last_working_day`);

--
-- Indexes for table `expense_claims`
--
ALTER TABLE `expense_claims`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_expense_claims_uuid` (`uuid`),
  ADD KEY `idx_expense_claims_org_status` (`organization_id`,`status`),
  ADD KEY `idx_expense_claims_employee` (`organization_id`,`employee_uuid`,`expense_date`),
  ADD KEY `idx_expense_claims_period` (`organization_id`,`expense_year`,`expense_month`),
  ADD KEY `idx_expense_claims_paid_via` (`paid_via_salary_record_uuid`),
  ADD KEY `idx_expense_claims_employee_uuid` (`employee_uuid`);

--
-- Indexes for table `final_settlements`
--
ALTER TABLE `final_settlements`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_final_settlements_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_final_settlements_exit` (`exit_request_uuid`),
  ADD KEY `idx_settlements_org_status` (`organization_id`,`status`),
  ADD KEY `idx_settlements_employee` (`organization_id`,`employee_uuid`),
  ADD KEY `fk_settlements_employee` (`employee_uuid`);

--
-- Indexes for table `holidays`
--
ALTER TABLE `holidays`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_holidays_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_holidays_org_date` (`organization_id`,`date`),
  ADD KEY `idx_holidays_org_date` (`organization_id`,`date`);

--
-- Indexes for table `hr_letters`
--
ALTER TABLE `hr_letters`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_hr_letters_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_hr_letters_reference` (`organization_id`,`reference_no`),
  ADD UNIQUE KEY `uk_hr_letters_qr_token` (`qr_token`),
  ADD KEY `idx_hr_letters_entity` (`organization_id`,`letter_type`,`status`),
  ADD KEY `idx_hr_letters_employee` (`employee_uuid`),
  ADD KEY `idx_hr_letters_qr` (`qr_token`),
  ADD KEY `fk_hr_letters_template` (`template_uuid`),
  ADD KEY `fk_hr_letters_issuer` (`issued_by_uuid`);

--
-- Indexes for table `interviews`
--
ALTER TABLE `interviews`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_interviews_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_interviews_org_uuid` (`organization_id`,`uuid`),
  ADD UNIQUE KEY `uk_interviews_interviewer_slot` (`organization_id`,`interviewer_uuid`,`scheduled_at`),
  ADD KEY `idx_interviews_candidate` (`organization_id`,`candidate_uuid`,`scheduled_at`),
  ADD KEY `idx_interviews_interviewer` (`organization_id`,`interviewer_uuid`,`scheduled_at`);

--
-- Indexes for table `invite_tokens`
--
ALTER TABLE `invite_tokens`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_invite_user_uuid` (`user_uuid`),
  ADD KEY `idx_invite_token_hash` (`token_hash`),
  ADD KEY `fk_it_user_idx` (`user_uuid`);

--
-- Indexes for table `job_openings`
--
ALTER TABLE `job_openings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_job_openings_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_job_openings_org_uuid` (`organization_id`,`uuid`),
  ADD KEY `idx_job_openings_org_status` (`organization_id`,`status`),
  ADD KEY `fk_job_openings_department_tenant` (`organization_id`,`department_id`),
  ADD KEY `fk_job_openings_designation_tenant` (`organization_id`,`designation_id`);

--
-- Indexes for table `lead_status_history`
--
ALTER TABLE `lead_status_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_lead` (`lead_type`,`lead_uuid`);

--
-- Indexes for table `leave_requests`
--
ALTER TABLE `leave_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_leave_requests_uuid` (`uuid`),
  ADD KEY `idx_leave_requests_employee` (`employee_uuid`),
  ADD KEY `idx_leave_requests_status` (`status`),
  ADD KEY `idx_leave_requests_type` (`leave_type_id`),
  ADD KEY `idx_leave_requests_approved_by` (`approved_by`);

--
-- Indexes for table `leave_types`
--
ALTER TABLE `leave_types`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_leave_types_org_name` (`organization_id`,`name`),
  ADD KEY `idx_leave_types_org` (`organization_id`);

--
-- Indexes for table `letter_templates`
--
ALTER TABLE `letter_templates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_letter_templates_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_letter_templates_org_name` (`organization_id`,`name`),
  ADD KEY `idx_letter_templates_org` (`organization_id`,`letter_type`,`is_active`),
  ADD KEY `fk_letter_templates_creator` (`created_by_uuid`);

--
-- Indexes for table `login_history`
--
ALTER TABLE `login_history`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_login_history_uuid` (`uuid`),
  ADD KEY `idx_login_history_identity` (`identity_type`,`identity_id`),
  ADD KEY `idx_login_history_date` (`login_at`);

--
-- Indexes for table `login_otps`
--
ALTER TABLE `login_otps`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_login_otps_lookup` (`identity_type`,`identity_id`,`used_at`);

--
-- Indexes for table `monthly_salary_variables`
--
ALTER TABLE `monthly_salary_variables`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_msv_uuid` (`uuid`),
  ADD KEY `idx_msv_period_employee` (`organization_id`,`employee_uuid`,`year`,`month`),
  ADD KEY `fk_msv_employee` (`employee_uuid`),
  ADD KEY `fk_msv_created_by` (`created_by`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notif_user_uuid` (`user_uuid`),
  ADD KEY `idx_notif_read` (`user_uuid`,`read_at`),
  ADD KEY `fk_notif_user_idx` (`user_uuid`);

--
-- Indexes for table `notification_preferences`
--
ALTER TABLE `notification_preferences`
  ADD PRIMARY KEY (`user_uuid`);

--
-- Indexes for table `offboarding_checklists`
--
ALTER TABLE `offboarding_checklists`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_offboarding_checklists_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_checklist_exit_task` (`exit_request_uuid`,`task_name`),
  ADD KEY `idx_checklist_org_status` (`organization_id`,`status`);

--
-- Indexes for table `offboarding_clearance_templates`
--
ALTER TABLE `offboarding_clearance_templates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_offboarding_clearance_template_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_offboarding_clearance_template_org_task` (`organization_id`,`task_name`),
  ADD KEY `idx_offboarding_clearance_template_org_active` (`organization_id`,`is_active`,`sort_order`);

--
-- Indexes for table `organizations`
--
ALTER TABLE `organizations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`),
  ADD UNIQUE KEY `uk_organizations_uuid` (`uuid`),
  ADD KEY `idx_organizations_uuid` (`uuid`),
  ADD KEY `idx_organizations_deleted_at` (`deleted_at`),
  ADD KEY `idx_org_subscription_plan_id` (`subscription_plan_id`),
  ADD KEY `idx_org_type` (`organization_type`),
  ADD KEY `fk_org_pending_plan` (`pending_plan_id`);

--
-- Indexes for table `organization_approval_policies`
--
ALTER TABLE `organization_approval_policies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_org_approval_policies_org` (`organization_id`);

--
-- Indexes for table `organization_ip_rules`
--
ALTER TABLE `organization_ip_rules`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_organization_ip_rules_org_ip` (`organization_id`,`ip_address`),
  ADD KEY `idx_organization_ip_rules_org` (`organization_id`);

--
-- Indexes for table `organization_monthly_payroll_settings`
--
ALTER TABLE `organization_monthly_payroll_settings`
  ADD PRIMARY KEY (`organization_id`,`year`,`month`);

--
-- Indexes for table `organization_monthly_work_schedules`
--
ALTER TABLE `organization_monthly_work_schedules`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_org_schedule_date` (`organization_id`,`schedule_date`),
  ADD KEY `idx_org_schedule_month` (`organization_id`,`schedule_date`);

--
-- Indexes for table `organization_payroll_policies`
--
ALTER TABLE `organization_payroll_policies`
  ADD PRIMARY KEY (`organization_id`),
  ADD KEY `idx_payroll_policy_configured` (`is_configured`);

--
-- Indexes for table `organization_payroll_settings`
--
ALTER TABLE `organization_payroll_settings`
  ADD PRIMARY KEY (`organization_id`);

--
-- Indexes for table `organization_types`
--
ALTER TABLE `organization_types`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_organization_types_name` (`name`);

--
-- Indexes for table `overtime_requests`
--
ALTER TABLE `overtime_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_overtime_requests_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_overtime_employee_date` (`employee_uuid`,`work_date`),
  ADD KEY `idx_overtime_org_status` (`organization_id`,`status`),
  ADD KEY `idx_overtime_org_date` (`organization_id`,`work_date`);

--
-- Indexes for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_prt_user_uuid` (`user_uuid`),
  ADD KEY `idx_prt_token_hash` (`token_hash`),
  ADD KEY `fk_prt_user_idx` (`user_uuid`);

--
-- Indexes for table `payment`
--
ALTER TABLE `payment`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_payment_uuid` (`uuid`),
  ADD UNIQUE KEY `uq_payment_txn_ref` (`transaction_reference`),
  ADD KEY `idx_pay_user` (`user_id`),
  ADD KEY `idx_payment_uuid` (`uuid`),
  ADD KEY `idx_payment_org` (`organization_id`);

--
-- Indexes for table `persons`
--
ALTER TABLE `persons`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_persons_uuid` (`uuid`),
  ADD UNIQUE KEY `uq_persons_cnic_hash` (`cnic_hash`);

--
-- Indexes for table `person_documents`
--
ALTER TABLE `person_documents`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_person_documents_uuid` (`uuid`),
  ADD KEY `idx_person_documents_person` (`person_id`),
  ADD KEY `idx_person_documents_doc_hash` (`document_hash`),
  ADD KEY `verified_by_organization_id` (`verified_by_organization_id`),
  ADD KEY `verified_by_verification_request_id` (`verified_by_verification_request_id`);

--
-- Indexes for table `refresh_tokens`
--
ALTER TABLE `refresh_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_refresh_token_hash` (`token_hash`),
  ADD KEY `idx_refresh_token_lookup` (`type`,`identifier`),
  ADD KEY `idx_refresh_token_expires` (`expires_at`);

--
-- Indexes for table `salary_components`
--
ALTER TABLE `salary_components`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_salary_components_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_salary_components_org_name_type` (`organization_id`,`name`,`type`),
  ADD KEY `idx_salary_components_org` (`organization_id`),
  ADD KEY `fk_sc_created_by` (`created_by`);

--
-- Indexes for table `salary_records`
--
ALTER TABLE `salary_records`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_salary_employee_month` (`employee_uuid`,`year`,`month`),
  ADD UNIQUE KEY `uk_salary_records_uuid` (`uuid`),
  ADD KEY `idx_salary_org_month` (`organization_id`,`year`,`month`),
  ADD KEY `idx_salary_employee` (`employee_uuid`),
  ADD KEY `fk_sr_created_by` (`created_by`);

--
-- Indexes for table `salary_record_lines`
--
ALTER TABLE `salary_record_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_salary_record_lines_uuid` (`uuid`),
  ADD KEY `idx_srl_record` (`salary_record_uuid`),
  ADD KEY `idx_srl_employee_period` (`employee_uuid`,`year`,`month`),
  ADD KEY `idx_srl_org` (`organization_id`);

--
-- Indexes for table `schema_migrations`
--
ALTER TABLE `schema_migrations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_schema_migrations_filename` (`filename`);

--
-- Indexes for table `self_subscription_requests`
--
ALTER TABLE `self_subscription_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_ssr_uuid` (`uuid`),
  ADD KEY `idx_ssr_org` (`organization_id`),
  ADD KEY `idx_ssr_status` (`status`),
  ADD KEY `fk_ssr_org_idx` (`organization_id`);

--
-- Indexes for table `subscription_checkouts`
--
ALTER TABLE `subscription_checkouts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_sco_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_sco_gateway_tracker_id` (`gateway_tracker_id`),
  ADD KEY `idx_sco_org_status` (`organization_id`,`status`),
  ADD KEY `idx_sco_plan_id` (`plan_id`),
  ADD KEY `idx_sco_gateway_event_id` (`gateway_event_id`),
  ADD KEY `fk_sco_org_idx` (`organization_id`),
  ADD KEY `idx_sco_pending_result` (`organization_id`,`resulted_in_pending_plan_id`,`status`),
  ADD KEY `idx_sco_refund_status` (`organization_id`,`refund_status`);

--
-- Indexes for table `subscription_plans`
--
ALTER TABLE `subscription_plans`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_subscription_plans_uuid` (`uuid`),
  ADD UNIQUE KEY `uq_subscription_plans_single_free` (`free_plan_guard`);

--
-- Indexes for table `support_tickets`
--
ALTER TABLE `support_tickets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_support_tickets_uuid` (`uuid`),
  ADD KEY `idx_support_tickets_org` (`organization_id`),
  ADD KEY `idx_support_tickets_status` (`status`),
  ADD KEY `idx_support_tickets_priority` (`priority`),
  ADD KEY `fk_st_org_idx` (`organization_id`),
  ADD KEY `fk_st_raised_by_idx` (`raised_by_uuid`),
  ADD KEY `idx_support_tickets_category` (`category`),
  ADD KEY `idx_support_tickets_assigned_role` (`assigned_to_role`),
  ADD KEY `idx_support_tickets_department` (`department_id`);

--
-- Indexes for table `support_ticket_replies`
--
ALTER TABLE `support_ticket_replies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_support_ticket_replies_uuid` (`uuid`),
  ADD KEY `idx_support_replies_ticket` (`ticket_uuid`),
  ADD KEY `fk_str_replied_by_idx` (`replied_by_uuid`),
  ADD KEY `fk_str_ticket_idx` (`ticket_uuid`);

--
-- Indexes for table `token_blacklist`
--
ALTER TABLE `token_blacklist`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_token_blacklist_hash` (`token_hash`),
  ADD KEY `idx_token_blacklist_expires` (`expires_at`);

--
-- Indexes for table `unmatched_organizations`
--
ALTER TABLE `unmatched_organizations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_unmatched_orgs_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_unmatched_orgs_name` (`name`),
  ADD KEY `idx_unmatched_orgs_status` (`status`),
  ADD KEY `idx_unmatched_orgs_assigned_org` (`assigned_organization_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `uk_users_uuid` (`uuid`),
  ADD UNIQUE KEY `cnic` (`cnic`),
  ADD UNIQUE KEY `uq_users_phone_normalized` (`phone_normalized`),
  ADD KEY `idx_users_org` (`organization`),
  ADD KEY `idx_users_uuid` (`uuid`),
  ADD KEY `idx_users_deleted_at` (`deleted_at`),
  ADD KEY `idx_users_cnic` (`cnic`);

--
-- Indexes for table `verification_requests`
--
ALTER TABLE `verification_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_verification_requests_uuid` (`uuid`),
  ADD UNIQUE KEY `uq_verification_requests_qr_token` (`qr_token`),
  ADD KEY `fk_vr_user` (`user_id`),
  ADD KEY `idx_vr_org` (`issuing_organization_id`),
  ADD KEY `idx_vr_status` (`status`),
  ADD KEY `idx_document_hash` (`document_hash`),
  ADD KEY `idx_verification_requests_uuid` (`uuid`),
  ADD KEY `idx_vr_unmatched_org` (`unmatched_org_id`),
  ADD KEY `idx_vr_locked_by` (`locked_by`),
  ADD KEY `idx_vr_sla` (`status`,`issuing_organization_id`,`created_at`),
  ADD KEY `idx_vr_verified_by` (`verified_by`),
  ADD KEY `idx_vr_linked_person` (`linked_person_id`),
  ADD KEY `fk_vr_matched_emp_doc` (`matched_employee_document_id`);

--
-- Indexes for table `workflow_definitions`
--
ALTER TABLE `workflow_definitions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_workflow_definitions_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_workflow_definitions_org` (`organization_id`,`module_key`,`entity_type`),
  ADD KEY `idx_workflow_definitions_org` (`organization_id`),
  ADD KEY `fk_workflow_definitions_creator` (`created_by_uuid`);

--
-- Indexes for table `workflow_steps`
--
ALTER TABLE `workflow_steps`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_workflow_steps_uuid` (`uuid`),
  ADD UNIQUE KEY `uk_workflow_steps_order` (`workflow_id`,`step_order`),
  ADD KEY `fk_workflow_steps_approver` (`approver_uuid`);

--
-- Indexes for table `work_week_config`
--
ALTER TABLE `work_week_config`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_work_week_org` (`organization_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `access_requests`
--
ALTER TABLE `access_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `admin_password_reset_tokens`
--
ALTER TABLE `admin_password_reset_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `admin_profiles`
--
ALTER TABLE `admin_profiles`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=77;

--
-- AUTO_INCREMENT for table `approval_requests`
--
ALTER TABLE `approval_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `approval_step_history`
--
ALTER TABLE `approval_step_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `assets`
--
ALTER TABLE `assets`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=83;

--
-- AUTO_INCREMENT for table `asset_assignments`
--
ALTER TABLE `asset_assignments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=75;

--
-- AUTO_INCREMENT for table `asset_maintenance`
--
ALTER TABLE `asset_maintenance`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `attachments`
--
ALTER TABLE `attachments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `attendance_records`
--
ALTER TABLE `attendance_records`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2319;

--
-- AUTO_INCREMENT for table `audit_logs`
--
ALTER TABLE `audit_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=598;

--
-- AUTO_INCREMENT for table `candidates`
--
ALTER TABLE `candidates`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `contact_leads`
--
ALTER TABLE `contact_leads`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `custom_plan_requests`
--
ALTER TABLE `custom_plan_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `daily_request_usage`
--
ALTER TABLE `daily_request_usage`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `departments`
--
ALTER TABLE `departments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `designations`
--
ALTER TABLE `designations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `designation_leave_policies`
--
ALTER TABLE `designation_leave_policies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `document_types`
--
ALTER TABLE `document_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=47;

--
-- AUTO_INCREMENT for table `email_outbox`
--
ALTER TABLE `email_outbox`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=130;

--
-- AUTO_INCREMENT for table `employees`
--
ALTER TABLE `employees`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=650;

--
-- AUTO_INCREMENT for table `employee_documents`
--
ALTER TABLE `employee_documents`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `employee_leave_allocations`
--
ALTER TABLE `employee_leave_allocations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=109;

--
-- AUTO_INCREMENT for table `employee_salary_components`
--
ALTER TABLE `employee_salary_components`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=88;

--
-- AUTO_INCREMENT for table `employee_salary_history`
--
ALTER TABLE `employee_salary_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=412;

--
-- AUTO_INCREMENT for table `exit_requests`
--
ALTER TABLE `exit_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `expense_claims`
--
ALTER TABLE `expense_claims`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=222;

--
-- AUTO_INCREMENT for table `final_settlements`
--
ALTER TABLE `final_settlements`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `holidays`
--
ALTER TABLE `holidays`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `hr_letters`
--
ALTER TABLE `hr_letters`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `interviews`
--
ALTER TABLE `interviews`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `invite_tokens`
--
ALTER TABLE `invite_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `job_openings`
--
ALTER TABLE `job_openings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `lead_status_history`
--
ALTER TABLE `lead_status_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `leave_requests`
--
ALTER TABLE `leave_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=62;

--
-- AUTO_INCREMENT for table `leave_types`
--
ALTER TABLE `leave_types`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=37;

--
-- AUTO_INCREMENT for table `letter_templates`
--
ALTER TABLE `letter_templates`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `login_history`
--
ALTER TABLE `login_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `login_otps`
--
ALTER TABLE `login_otps`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `monthly_salary_variables`
--
ALTER TABLE `monthly_salary_variables`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=53;

--
-- AUTO_INCREMENT for table `offboarding_checklists`
--
ALTER TABLE `offboarding_checklists`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `offboarding_clearance_templates`
--
ALTER TABLE `offboarding_clearance_templates`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `organizations`
--
ALTER TABLE `organizations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=121;

--
-- AUTO_INCREMENT for table `organization_approval_policies`
--
ALTER TABLE `organization_approval_policies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `organization_ip_rules`
--
ALTER TABLE `organization_ip_rules`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `organization_monthly_work_schedules`
--
ALTER TABLE `organization_monthly_work_schedules`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=612;

--
-- AUTO_INCREMENT for table `organization_types`
--
ALTER TABLE `organization_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `overtime_requests`
--
ALTER TABLE `overtime_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=66;

--
-- AUTO_INCREMENT for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment`
--
ALTER TABLE `payment`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `persons`
--
ALTER TABLE `persons`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `person_documents`
--
ALTER TABLE `person_documents`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `refresh_tokens`
--
ALTER TABLE `refresh_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=190;

--
-- AUTO_INCREMENT for table `salary_components`
--
ALTER TABLE `salary_components`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=96;

--
-- AUTO_INCREMENT for table `salary_records`
--
ALTER TABLE `salary_records`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=55;

--
-- AUTO_INCREMENT for table `salary_record_lines`
--
ALTER TABLE `salary_record_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=186;

--
-- AUTO_INCREMENT for table `schema_migrations`
--
ALTER TABLE `schema_migrations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=127;

--
-- AUTO_INCREMENT for table `self_subscription_requests`
--
ALTER TABLE `self_subscription_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `subscription_checkouts`
--
ALTER TABLE `subscription_checkouts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `subscription_plans`
--
ALTER TABLE `subscription_plans`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `support_tickets`
--
ALTER TABLE `support_tickets`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `support_ticket_replies`
--
ALTER TABLE `support_ticket_replies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `token_blacklist`
--
ALTER TABLE `token_blacklist`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `unmatched_organizations`
--
ALTER TABLE `unmatched_organizations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=237;

--
-- AUTO_INCREMENT for table `verification_requests`
--
ALTER TABLE `verification_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `workflow_definitions`
--
ALTER TABLE `workflow_definitions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `workflow_steps`
--
ALTER TABLE `workflow_steps`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `work_week_config`
--
ALTER TABLE `work_week_config`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `approval_requests`
--
ALTER TABLE `approval_requests`
  ADD CONSTRAINT `fk_approval_requests_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_approval_requests_requester` FOREIGN KEY (`requested_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_approval_requests_resolver` FOREIGN KEY (`resolved_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_approval_requests_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `workflow_definitions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `approval_step_history`
--
ALTER TABLE `approval_step_history`
  ADD CONSTRAINT `fk_approval_step_history_approver` FOREIGN KEY (`approver_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_approval_step_history_request` FOREIGN KEY (`approval_request_uuid`) REFERENCES `approval_requests` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_approval_step_history_step` FOREIGN KEY (`step_id`) REFERENCES `workflow_steps` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `assets`
--
ALTER TABLE `assets`
  ADD CONSTRAINT `fk_assets_creator` FOREIGN KEY (`created_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_assets_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `asset_assignments`
--
ALTER TABLE `asset_assignments`
  ADD CONSTRAINT `fk_asset_assignments_asset` FOREIGN KEY (`asset_uuid`) REFERENCES `assets` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_asset_assignments_assigner` FOREIGN KEY (`assigned_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_asset_assignments_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_asset_assignments_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_asset_assignments_returner` FOREIGN KEY (`returned_to_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL;

--
-- Constraints for table `asset_maintenance`
--
ALTER TABLE `asset_maintenance`
  ADD CONSTRAINT `fk_asset_maintenance_asset` FOREIGN KEY (`asset_uuid`) REFERENCES `assets` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_asset_maintenance_finisher` FOREIGN KEY (`completed_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_asset_maintenance_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_asset_maintenance_reporter` FOREIGN KEY (`reported_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL;

--
-- Constraints for table `attachments`
--
ALTER TABLE `attachments`
  ADD CONSTRAINT `fk_attachments_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_attachments_uploader` FOREIGN KEY (`uploaded_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL;

--
-- Constraints for table `attendance_records`
--
ALTER TABLE `attendance_records`
  ADD CONSTRAINT `fk_attendance_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_attendance_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `candidates`
--
ALTER TABLE `candidates`
  ADD CONSTRAINT `fk_candidates_converted_employee` FOREIGN KEY (`converted_employee_uuid`) REFERENCES `employees` (`uuid`),
  ADD CONSTRAINT `fk_candidates_interview_override_by` FOREIGN KEY (`failed_interview_override_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_candidates_opening_tenant` FOREIGN KEY (`organization_id`,`job_opening_uuid`) REFERENCES `job_openings` (`organization_id`, `uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_candidates_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `custom_plan_requests`
--
ALTER TABLE `custom_plan_requests`
  ADD CONSTRAINT `fk_cpr_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`);

--
-- Constraints for table `daily_request_usage`
--
ALTER TABLE `daily_request_usage`
  ADD CONSTRAINT `fk_dru_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`);

--
-- Constraints for table `departments`
--
ALTER TABLE `departments`
  ADD CONSTRAINT `fk_departments_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `designations`
--
ALTER TABLE `designations`
  ADD CONSTRAINT `fk_designations_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `designation_leave_policies`
--
ALTER TABLE `designation_leave_policies`
  ADD CONSTRAINT `fk_dlp_designation` FOREIGN KEY (`designation_id`) REFERENCES `designations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_dlp_leave_type` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_dlp_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `employees`
--
ALTER TABLE `employees`
  ADD CONSTRAINT `fk_emp_added_by` FOREIGN KEY (`added_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_emp_linked_user` FOREIGN KEY (`linked_user_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_emp_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`),
  ADD CONSTRAINT `fk_emp_promoted_by` FOREIGN KEY (`promoted_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_employee_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_employee_designation` FOREIGN KEY (`designation_id`) REFERENCES `designations` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_employees_reporting_manager` FOREIGN KEY (`reporting_manager_uuid`) REFERENCES `employees` (`uuid`) ON DELETE SET NULL;

--
-- Constraints for table `employee_documents`
--
ALTER TABLE `employee_documents`
  ADD CONSTRAINT `fk_employee_documents_emp` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE;

--
-- Constraints for table `employee_leave_allocations`
--
ALTER TABLE `employee_leave_allocations`
  ADD CONSTRAINT `fk_ela_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ela_type` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types` (`id`);

--
-- Constraints for table `employee_salary_components`
--
ALTER TABLE `employee_salary_components`
  ADD CONSTRAINT `fk_esc_component` FOREIGN KEY (`salary_component_id`) REFERENCES `salary_components` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_esc_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE;

--
-- Constraints for table `employee_salary_history`
--
ALTER TABLE `employee_salary_history`
  ADD CONSTRAINT `fk_esh_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_esh_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE;

--
-- Constraints for table `exit_requests`
--
ALTER TABLE `exit_requests`
  ADD CONSTRAINT `fk_exit_requests_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_exit_requests_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `expense_claims`
--
ALTER TABLE `expense_claims`
  ADD CONSTRAINT `fk_expense_claims_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_expense_claims_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `final_settlements`
--
ALTER TABLE `final_settlements`
  ADD CONSTRAINT `fk_settlements_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_settlements_exit` FOREIGN KEY (`exit_request_uuid`) REFERENCES `exit_requests` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_settlements_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `holidays`
--
ALTER TABLE `holidays`
  ADD CONSTRAINT `fk_holidays_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `hr_letters`
--
ALTER TABLE `hr_letters`
  ADD CONSTRAINT `fk_hr_letters_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_hr_letters_issuer` FOREIGN KEY (`issued_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_hr_letters_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_hr_letters_template` FOREIGN KEY (`template_uuid`) REFERENCES `letter_templates` (`uuid`) ON DELETE SET NULL;

--
-- Constraints for table `interviews`
--
ALTER TABLE `interviews`
  ADD CONSTRAINT `fk_interviews_candidate_tenant` FOREIGN KEY (`organization_id`,`candidate_uuid`) REFERENCES `candidates` (`organization_id`, `uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_interviews_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `invite_tokens`
--
ALTER TABLE `invite_tokens`
  ADD CONSTRAINT `fk_it_user` FOREIGN KEY (`user_uuid`) REFERENCES `users` (`uuid`);

--
-- Constraints for table `job_openings`
--
ALTER TABLE `job_openings`
  ADD CONSTRAINT `fk_job_openings_department_tenant` FOREIGN KEY (`organization_id`,`department_id`) REFERENCES `departments` (`organization_id`, `id`),
  ADD CONSTRAINT `fk_job_openings_designation_tenant` FOREIGN KEY (`organization_id`,`designation_id`) REFERENCES `designations` (`organization_id`, `id`),
  ADD CONSTRAINT `fk_job_openings_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `leave_requests`
--
ALTER TABLE `leave_requests`
  ADD CONSTRAINT `fk_leave_requests_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_leave_requests_type` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types` (`id`);

--
-- Constraints for table `leave_types`
--
ALTER TABLE `leave_types`
  ADD CONSTRAINT `fk_leave_types_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `letter_templates`
--
ALTER TABLE `letter_templates`
  ADD CONSTRAINT `fk_letter_templates_creator` FOREIGN KEY (`created_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_letter_templates_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `monthly_salary_variables`
--
ALTER TABLE `monthly_salary_variables`
  ADD CONSTRAINT `fk_msv_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_msv_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_msv_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_uuid`) REFERENCES `users` (`uuid`) ON DELETE CASCADE;

--
-- Constraints for table `notification_preferences`
--
ALTER TABLE `notification_preferences`
  ADD CONSTRAINT `fk_notification_preferences_user` FOREIGN KEY (`user_uuid`) REFERENCES `users` (`uuid`) ON DELETE CASCADE;

--
-- Constraints for table `offboarding_checklists`
--
ALTER TABLE `offboarding_checklists`
  ADD CONSTRAINT `fk_checklist_exit` FOREIGN KEY (`exit_request_uuid`) REFERENCES `exit_requests` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_checklist_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `offboarding_clearance_templates`
--
ALTER TABLE `offboarding_clearance_templates`
  ADD CONSTRAINT `fk_offboarding_clearance_template_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `organizations`
--
ALTER TABLE `organizations`
  ADD CONSTRAINT `fk_org_org_type` FOREIGN KEY (`organization_type`) REFERENCES `organization_types` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_org_pending_plan` FOREIGN KEY (`pending_plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_org_subscription_plan_id` FOREIGN KEY (`subscription_plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `organization_approval_policies`
--
ALTER TABLE `organization_approval_policies`
  ADD CONSTRAINT `fk_org_approval_policies_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `organization_ip_rules`
--
ALTER TABLE `organization_ip_rules`
  ADD CONSTRAINT `fk_organization_ip_rules_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `organization_payroll_policies`
--
ALTER TABLE `organization_payroll_policies`
  ADD CONSTRAINT `fk_payroll_policy_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `overtime_requests`
--
ALTER TABLE `overtime_requests`
  ADD CONSTRAINT `fk_overtime_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_overtime_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `fk_prt_user` FOREIGN KEY (`user_uuid`) REFERENCES `users` (`uuid`) ON DELETE CASCADE;

--
-- Constraints for table `payment`
--
ALTER TABLE `payment`
  ADD CONSTRAINT `fk_pay_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_pay_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `person_documents`
--
ALTER TABLE `person_documents`
  ADD CONSTRAINT `person_documents_ibfk_1` FOREIGN KEY (`person_id`) REFERENCES `persons` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `person_documents_ibfk_2` FOREIGN KEY (`verified_by_organization_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `person_documents_ibfk_3` FOREIGN KEY (`verified_by_verification_request_id`) REFERENCES `verification_requests` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `salary_components`
--
ALTER TABLE `salary_components`
  ADD CONSTRAINT `fk_salary_components_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_sc_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `salary_records`
--
ALTER TABLE `salary_records`
  ADD CONSTRAINT `fk_salary_employee` FOREIGN KEY (`employee_uuid`) REFERENCES `employees` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_salary_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_sr_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `salary_record_lines`
--
ALTER TABLE `salary_record_lines`
  ADD CONSTRAINT `fk_srl_record` FOREIGN KEY (`salary_record_uuid`) REFERENCES `salary_records` (`uuid`) ON DELETE CASCADE;

--
-- Constraints for table `self_subscription_requests`
--
ALTER TABLE `self_subscription_requests`
  ADD CONSTRAINT `fk_ssr_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`);

--
-- Constraints for table `subscription_checkouts`
--
ALTER TABLE `subscription_checkouts`
  ADD CONSTRAINT `fk_sco_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`);

--
-- Constraints for table `support_tickets`
--
ALTER TABLE `support_tickets`
  ADD CONSTRAINT `fk_st_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`),
  ADD CONSTRAINT `fk_st_raised_by` FOREIGN KEY (`raised_by_uuid`) REFERENCES `users` (`uuid`),
  ADD CONSTRAINT `fk_support_tickets_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `support_ticket_replies`
--
ALTER TABLE `support_ticket_replies`
  ADD CONSTRAINT `fk_str_replied_by` FOREIGN KEY (`replied_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_str_ticket` FOREIGN KEY (`ticket_uuid`) REFERENCES `support_tickets` (`uuid`) ON DELETE CASCADE;

--
-- Constraints for table `unmatched_organizations`
--
ALTER TABLE `unmatched_organizations`
  ADD CONSTRAINT `fk_unmatched_orgs_assigned_org` FOREIGN KEY (`assigned_organization_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_org` FOREIGN KEY (`organization`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `verification_requests`
--
ALTER TABLE `verification_requests`
  ADD CONSTRAINT `fk_vr_linked_person` FOREIGN KEY (`linked_person_id`) REFERENCES `persons` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vr_locked_by_admin` FOREIGN KEY (`locked_by`) REFERENCES `admin_profiles` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vr_matched_emp_doc` FOREIGN KEY (`matched_employee_document_id`) REFERENCES `employee_documents` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vr_org` FOREIGN KEY (`issuing_organization_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_vr_unmatched_org` FOREIGN KEY (`unmatched_org_id`) REFERENCES `unmatched_organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_vr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `workflow_definitions`
--
ALTER TABLE `workflow_definitions`
  ADD CONSTRAINT `fk_workflow_definitions_creator` FOREIGN KEY (`created_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_workflow_definitions_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `workflow_steps`
--
ALTER TABLE `workflow_steps`
  ADD CONSTRAINT `fk_workflow_steps_approver` FOREIGN KEY (`approver_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_workflow_steps_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `workflow_definitions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `work_week_config`
--
ALTER TABLE `work_week_config`
  ADD CONSTRAINT `fk_work_week_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
