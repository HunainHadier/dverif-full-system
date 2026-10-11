-- Simplify recruitment offers to ready -> sent -> hired.
-- Keep existing prepared approvals sendable after removing the approval step.
UPDATE `candidates`
   SET `offer_status` = 'ready'
 WHERE `offer_status` IN ('draft', 'pending_approval', 'approved')
   AND `offer_template_uuid` IS NOT NULL
   AND `offer_body_snapshot` IS NOT NULL
   AND `offer_snapshot_hash` IS NOT NULL;

UPDATE `candidates`
   SET `offer_status` = NULL
 WHERE `offer_status` IN ('draft', 'pending_approval', 'approved', 'declined', 'rejected');

UPDATE `candidates`
   SET `offer_status` = 'hired'
 WHERE `offer_status` = 'accepted';

ALTER TABLE `candidates`
  MODIFY COLUMN `offer_status` ENUM('ready', 'sent', 'hired') NULL DEFAULT NULL;
