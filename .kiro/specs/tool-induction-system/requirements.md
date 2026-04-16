# Requirements Document

## Introduction

An online tool induction and refresher training system for the makerspace community, extending the existing hacmandocs platform. Members self-serve by selecting tools they need induction or refresher training on, completing online quizzes (similar to Google Forms), and tracking their own certification status. Trainers monitor completions so they can sign members off in the external makerspace member system. Admins manage tool records and quizzes. The system handles online quizzes only — in-person inductions happen externally and are not recorded here. Tools themselves are already managed in the external member system; this system only stores the minimal tool record needed to associate a quiz and retraining interval.

## Glossary

- **Induction_System**: The online tool induction and refresher training feature within the existing Docs_System
- **Tool_Record**: A lightweight record in the Induction_System representing a makerspace tool, consisting of a name, an associated Quiz, a quiz type (online induction or refresher), and a Retraining_Interval for refresher quizzes. Tools are managed in the external makerspace member system; the Tool_Record exists only to link a Quiz and retraining schedule
- **Quiz**: An online assessment (similar to a Google Form) consisting of questions that a member must answer with 100% correctness to pass. A Quiz is marked as either an "online induction" quiz or a "refresher" quiz
- **Question**: A single item within a Quiz; supports multiple-choice and true/false formats, with exactly one correct answer
- **Quiz_Attempt**: A single instance of a member taking a Quiz, recording the answers given, the score achieved, and whether the attempt was a pass or fail
- **Certification**: A record that a specific member has passed a Quiz for a specific Tool_Record, including the completion date and, for refresher quizzes, an expiry date
- **Retraining_Interval**: A duration (in days) configured on a refresher-type Tool_Record, after which the member's Certification expires and the member must retake the refresher Quiz
- **Trainer**: A user with the Trainer permission level who can view all members' induction and refresher statuses, but cannot manage quizzes or Tool_Records
- **Member_Profile**: The member-facing view within a member's profile showing available inductions and refreshers, completed certifications, and time remaining until retraining is due
- **Trainer_Dashboard**: The Trainer-facing view showing all members' induction completions and refresher training statuses
- **Docs_System**: The existing hacmandocs document management platform, including its authentication, user accounts, permission hierarchy, and Cloudflare Workers backend
- **Makerspace_Member_System**: The external makerspace member management system where tools and member records are maintained; the Induction_System does not write to this system

## Requirements

### Requirement 1: Tool Record Management

**User Story:** As an admin, I want to create simple tool records that link a tool name to a quiz and retraining schedule, so that members can find and complete the correct induction or refresher for each tool.

#### Acceptance Criteria

1. WHEN an Admin creates a Tool_Record, THE Induction_System SHALL require a tool name, a quiz type (online induction or refresher), and an associated Quiz
2. WHEN an Admin creates a refresher-type Tool_Record, THE Induction_System SHALL require a Retraining_Interval in days
3. WHEN an Admin creates an online-induction-type Tool_Record, THE Induction_System SHALL store the Tool_Record without a Retraining_Interval
4. IF an Admin attempts to create a Tool_Record with a name that already exists, THEN THE Induction_System SHALL reject the creation and display an error indicating the name is already in use
5. THE Induction_System SHALL display a list of all Tool_Records with their name, quiz type, associated Quiz, and Retraining_Interval (where applicable)
6. WHEN an Admin updates a refresher-type Tool_Record's Retraining_Interval, THE Induction_System SHALL apply the new interval to all future Certifications and recalculate expiry dates for existing active Certifications on that Tool_Record

### Requirement 2: Quiz Creation and Management

**User Story:** As an admin, I want to create and manage quizzes for tool inductions and refreshers, so that members can be assessed on their knowledge.

#### Acceptance Criteria

1. WHEN an Admin creates a Quiz, THE Induction_System SHALL require a title and at least one Question
2. WHEN an Admin adds a Question to a Quiz, THE Induction_System SHALL require question text, a question type (multiple-choice or true/false), at least two answer options, and exactly one correct answer designation
3. WHEN an Admin publishes a Quiz, THE Induction_System SHALL make the Quiz available for members to take and prevent structural modifications to published Questions (question text, answer options, correct answer) while allowing the addition of new Questions
4. WHEN an Admin archives a Quiz, THE Induction_System SHALL prevent new Quiz_Attempts and retain all existing Quiz_Attempt records for historical reference
5. IF an Admin attempts to publish a Quiz with zero Questions, THEN THE Induction_System SHALL reject the publication and display an error indicating at least one Question is required
6. THE Induction_System SHALL restrict Quiz creation, editing, publishing, and archiving to users with the Admin permission level


### Requirement 3: Quiz Taking (100% Pass Mark, Unlimited Attempts)

**User Story:** As a member, I want to take an online quiz for a tool induction or refresher, so that I can become certified or renew my certification on that tool.

#### Acceptance Criteria

1. WHEN a member starts a Quiz, THE Induction_System SHALL present all Questions in the Quiz and allow the member to select answers for each Question
2. WHEN a member submits a completed Quiz, THE Induction_System SHALL calculate the score as the percentage of correctly answered Questions, record a Quiz_Attempt with the score and pass/fail result, and display the result to the member
3. THE Induction_System SHALL require 100% correct answers to pass any Quiz (both online induction and refresher types)
4. WHEN a member achieves 100% on an online-induction-type Quiz, THE Induction_System SHALL create a Certification for the member on the associated Tool_Record with the current date as the completion date and no expiry date
5. WHEN a member achieves 100% on a refresher-type Quiz, THE Induction_System SHALL create a Certification for the member on the associated Tool_Record with an expiry date calculated as the current date plus the Tool_Record's Retraining_Interval
6. WHEN a member scores below 100%, THE Induction_System SHALL record the failed Quiz_Attempt and prompt the member to retake the Quiz
7. THE Induction_System SHALL allow unlimited Quiz attempts for all members on all Quizzes
8. THE Induction_System SHALL record each Quiz_Attempt with the member identity, Quiz identity, answers given, score achieved, pass/fail result, and a timestamp

### Requirement 4: Member Self-Service Profile

**User Story:** As a member, I want to see my induction and refresher status in my profile, so that I can track what I have completed, what is available, and when retraining is due.

#### Acceptance Criteria

1. WHEN a member accesses the Member_Profile, THE Induction_System SHALL display a list of all available Tool_Records the member has not yet completed, with a link to start the associated Quiz
2. WHEN a member accesses the Member_Profile, THE Induction_System SHALL display a list of all completed Certifications with the Tool_Record name, completion date, and quiz type
3. WHEN a member accesses the Member_Profile, THE Induction_System SHALL display the time remaining until retraining is due for each active refresher-type Certification
4. WHEN a member accesses the Member_Profile, THE Induction_System SHALL display expired refresher Certifications with the Tool_Record name, original expiry date, and a link to retake the refresher Quiz
5. THE Induction_System SHALL sort refresher Certifications on the Member_Profile by expiry date in ascending order, showing the soonest-to-expire Certifications first
6. WHEN a member selects a Tool_Record from the available list (e.g., "I need retraining on the angle grinder"), THE Induction_System SHALL navigate the member to the associated Quiz

### Requirement 5: Trainer Permission Level

**User Story:** As a system administrator, I want a Trainer permission level separate from the existing roles, so that designated trainers can monitor member induction and refresher statuses without having full admin access.

#### Acceptance Criteria

1. THE Induction_System SHALL add a Trainer permission level to the existing permission hierarchy (Viewer, Editor, Approver, Admin) in the Docs_System
2. THE Induction_System SHALL position the Trainer permission level as a separate role that does not grant access to Docs_System admin features (document management, category management, user management)
3. WHEN an Admin assigns the Trainer permission level to a user, THE Induction_System SHALL grant that user access to the Trainer_Dashboard
4. THE Induction_System SHALL restrict Trainer users from creating, editing, publishing, or archiving Quizzes and Tool_Records
5. THE Induction_System SHALL restrict Trainer users from modifying any member's Certification records
6. WHEN a user with the Trainer permission level accesses the Docs_System, THE Induction_System SHALL grant the same document access as the Viewer permission level

### Requirement 6: Trainer Dashboard

**User Story:** As a trainer, I want to view all members' induction and refresher statuses, so that I can sign off online inductions in the external member system and identify members with expired refresher training.

#### Acceptance Criteria

1. WHEN a Trainer accesses the Trainer_Dashboard, THE Induction_System SHALL display a list of members who have completed online induction quizzes, showing the member name, Tool_Record name, and completion date, so the Trainer can sign them off in the Makerspace_Member_System
2. WHEN a Trainer accesses the Trainer_Dashboard, THE Induction_System SHALL display a list of members with expired refresher Certifications, showing the member name, Tool_Record name, and the number of days since expiry
3. WHEN a Trainer accesses the Trainer_Dashboard, THE Induction_System SHALL display a list of members with refresher Certifications expiring within 30 days, showing the member name, Tool_Record name, and days remaining
4. WHEN a Trainer selects a specific Tool_Record on the Trainer_Dashboard, THE Induction_System SHALL display all members who have completed the associated Quiz, their completion dates, and current refresher status (active, expiring soon, or expired) where applicable
5. WHEN a Trainer selects a specific member on the Trainer_Dashboard, THE Induction_System SHALL display all Certifications held by that member, including completion dates, expiry dates (for refresher types), and current status
6. THE Induction_System SHALL provide the Trainer with the ability to filter and search members by name, Tool_Record, and certification status (completed, expiring soon, expired)
7. THE Induction_System SHALL restrict access to the Trainer_Dashboard to users with the Trainer or Admin permission level


### Requirement 7: Certification Expiry and Retraining

**User Story:** As a member, I want to be notified when my refresher certification is expiring and be able to retake the quiz, so that I stay up to date on tool training.

#### Acceptance Criteria

1. WHEN a refresher-type Certification's expiry date has passed, THE Induction_System SHALL mark the Certification as expired
2. WHEN a member's refresher Certification expires, THE Induction_System SHALL display the expired Certification on the Member_Profile with a prompt to retake the refresher Quiz
3. WHEN a member passes the refresher Quiz for an expired Certification, THE Induction_System SHALL create a new Certification with a new expiry date calculated as the current date plus the Tool_Record's Retraining_Interval and retain the expired Certification record for historical reference
4. THE Induction_System SHALL treat online-induction-type Certifications as permanent records with no expiry

### Requirement 8: Email Notifications for Expiring Certifications

**User Story:** As a member, I want to receive email notifications when my refresher certification is approaching expiry, so that I can retrain before losing my certification.

#### Acceptance Criteria

1. WHEN a member's refresher Certification is 14 days before its expiry date, THE Induction_System SHALL send a warning email to the member stating the Tool_Record name, expiry date, and a link to retake the refresher Quiz
2. WHEN a member's refresher Certification reaches its expiry date, THE Induction_System SHALL send an expired email to the member stating the Tool_Record name and a link to retake the refresher Quiz
3. WHEN a member's refresher Certification is 30 days past its expiry date, THE Induction_System SHALL send a final email to the member explaining that the member has been marked as "untrained" on the Tool_Record
4. THE Induction_System SHALL send each notification email (14-day warning, expiry-day, 30-day post-expiry) at most once per Certification per expiry cycle
5. IF the Induction_System fails to send a notification email, THEN THE Induction_System SHALL log the failure with the member identity, Tool_Record name, notification type, and timestamp for admin review

### Requirement 9: Integration with Existing Docs System

**User Story:** As a developer, I want the induction system to use the existing authentication, user accounts, and backend infrastructure, so that there is a single unified platform without duplicate user management.

#### Acceptance Criteria

1. THE Induction_System SHALL authenticate users using the same session mechanism (Cloudflare KV session tokens) and authentication methods (OAuth 2.0 and Makerspace_Member_API) as the existing Docs_System
2. THE Induction_System SHALL use the existing users table from the Docs_System to identify members
3. THE Induction_System SHALL extend the existing permission hierarchy (Viewer, Editor, Approver, Admin) with the Trainer permission level without breaking existing Docs_System permission checks
4. WHEN a user with Viewer, Editor, or Approver permission level accesses the Induction_System, THE Induction_System SHALL grant access to the Member_Profile, quiz taking, and viewing personal Certifications
5. WHEN a user with Admin permission level accesses the Induction_System, THE Induction_System SHALL grant access to Tool_Record management, Quiz management, and the Trainer_Dashboard
6. THE Induction_System SHALL extend the existing Cloudflare D1 database with new tables for Tool_Records, Quizzes, Questions, Certifications, and Quiz_Attempts without modifying existing Docs_System tables
7. THE Induction_System SHALL be served from the same Cloudflare Worker and web application as the existing Docs_System, sharing the same API routing structure under a dedicated path prefix

### Requirement 10: Makerspace Member System API Integration (Future)

**User Story:** As an admin, I want training data to be auto-populated from the makerspace member system API in the future, so that members do not need to manually manage their training records.

#### Acceptance Criteria

1. WHERE the Makerspace_Member_System API integration is enabled in a future release, THE Induction_System SHALL import tool names and member training records from the Makerspace_Member_System API
2. WHERE the Makerspace_Member_System API integration is enabled in a future release, THE Induction_System SHALL synchronise Certification records with the Makerspace_Member_System so that quiz completions are reflected in both systems

> **Note:** This requirement is a stretch goal for a future release. For the initial release, members self-manage their induction and refresher training through the Induction_System. No integration with the Makerspace_Member_System API is implemented in the first version.
