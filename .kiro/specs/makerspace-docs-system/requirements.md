# Requirements Document

## Introduction

A document management system for a makerspace community that replaces the current GitHub-based documentation workflow. The system prioritizes content portability from the existing GitHub repository, provides an intuitive UI/UX accessible to non-technical contributors, and maintains a structured approval workflow with role-based permissions. The goal is to lower the barrier to contribution while preserving the rigor of reviewed, approved content.

## Glossary

- **Docs_System**: The makerspace document management web application
- **Document**: A single piece of content (guide, policy, reference, etc.) stored and managed within the Docs_System
- **Contributor**: A user who creates or edits document content
- **Viewer**: A user with read-only access to documents
- **Editor**: A user who can create new documents and propose edits to existing documents
- **Approver**: A user who can review, approve, or reject proposed edits
- **Admin**: A user with full system permissions including user management and system configuration
- **Edit_Proposal**: A submitted set of changes to a document that requires review and approval before publication
- **Rich_Text_Editor**: The WYSIWYG editing interface used by contributors to author and modify documents
- **Markdown**: A lightweight markup language used for formatting text, and the format of the existing GitHub-based documentation
- **Makerspace_Member_API**: The existing makerspace member system API used to verify member credentials and return a session token with the member's username
- **Import_Engine**: The component responsible for converting and ingesting Markdown content from the existing GitHub repository into the Docs_System
- **Sensitive_Page**: A document type designated for sensitive organisational content that requires explicit Admin approval before publication, bypassing the standard Approver workflow
- **Visibility_Group**: A named group of users that controls which users can view specific documents
- **Group_Level**: A hierarchical classification assigned to a Visibility_Group, one of: Member, Non_Member, Team_Leader, Manager, or Board_Member

## Requirements

### Requirement 1: Content Import from GitHub

**User Story:** As an admin, I want to import existing Markdown documentation from our GitHub repository, so that all current content is preserved and available in the new system without manual re-creation.

#### Acceptance Criteria

1. WHEN an Admin initiates a content import and provides a GitHub repository URL, THE Import_Engine SHALL retrieve all Markdown files from the specified repository
2. WHEN a Markdown file is retrieved, THE Import_Engine SHALL parse the Markdown content and convert it into the Docs_System internal document format while preserving all headings, lists, links, images, code blocks, and tables
3. WHEN the import is complete, THE Import_Engine SHALL generate a summary report listing the number of documents imported, any files that failed to import, and the reason for each failure
4. IF a Markdown file contains syntax that the Import_Engine cannot parse, THEN THE Import_Engine SHALL log the file path and the unparsable content, skip the unparsable section, and continue importing the remainder of the file
5. FOR ALL valid Markdown documents, parsing then exporting back to Markdown then parsing again SHALL produce an equivalent internal document (round-trip property)

### Requirement 2: Markdown Export

**User Story:** As an editor, I want to export documents back to Markdown format, so that content remains portable and can be used outside the Docs_System if needed.

#### Acceptance Criteria

1. WHEN an Editor or Admin selects a document for export, THE Docs_System SHALL generate a valid Markdown file that represents the full content of the document
2. WHEN multiple documents are selected for export, THE Docs_System SHALL generate a ZIP archive containing all exported Markdown files preserving the original folder structure
3. THE Docs_System SHALL preserve all formatting elements including headings, lists, links, images, code blocks, and tables during export

### Requirement 3: Rich Text Editing

**User Story:** As an editor, I want to use a visual rich-text editor to create and modify documents, so that I can contribute content without needing to know Markdown syntax.

#### Acceptance Criteria

1. WHEN an Editor opens a document for editing, THE Rich_Text_Editor SHALL provide a WYSIWYG interface supporting headings, bold, italic, lists, links, images, code blocks, and tables
2. WHILE an Editor is editing a document, THE Rich_Text_Editor SHALL display a live preview of the formatted output
3. WHEN an Editor saves a document, THE Rich_Text_Editor SHALL convert the rich-text content into the Docs_System internal format and persist the changes as a draft
4. IF the Editor loses network connectivity while editing, THEN THE Rich_Text_Editor SHALL retain unsaved changes in local browser storage and restore them when connectivity is re-established

### Requirement 4: Edit Proposal and Approval Workflow

**User Story:** As an editor, I want to submit proposed edits for review, so that all changes are vetted before being published.

#### Acceptance Criteria

1. WHEN an Editor submits an edit, THE Docs_System SHALL create an Edit_Proposal containing the proposed changes, the author identity, and a timestamp
2. WHEN an Edit_Proposal is created, THE Docs_System SHALL notify all Approvers assigned to the document's category via email or in-app notification
3. WHEN an Approver reviews an Edit_Proposal, THE Docs_System SHALL display a side-by-side diff comparing the current published version with the proposed changes
4. WHEN an Approver approves an Edit_Proposal, THE Docs_System SHALL publish the proposed changes and update the document to the new version
5. WHEN an Approver rejects an Edit_Proposal, THE Docs_System SHALL record the rejection reason and notify the original Editor
6. WHILE an Edit_Proposal is pending review, THE Docs_System SHALL prevent the same document sections from being modified by another Edit_Proposal
7. THE Docs_System SHALL maintain a complete version history for each document, recording the author, timestamp, and approval details for every published change

### Requirement 5: Role-Based Access Control

**User Story:** As an admin, I want to assign permission levels to users, so that access to view, edit, and approve content is controlled appropriately.

#### Acceptance Criteria

1. THE Docs_System SHALL support four permission levels: Viewer, Editor, Approver, and Admin
2. WHEN a Viewer accesses the Docs_System, THE Docs_System SHALL allow read-only access to all published documents and deny access to editing, proposing, or approving changes
3. WHEN an Editor accesses the Docs_System, THE Docs_System SHALL allow creating new documents and submitting Edit_Proposals, and deny access to approving or rejecting Edit_Proposals
4. WHEN an Approver accesses the Docs_System, THE Docs_System SHALL allow all Editor permissions plus the ability to approve or reject Edit_Proposals
5. WHEN an Admin accesses the Docs_System, THE Docs_System SHALL allow all Approver permissions plus user management, system configuration, and content import/export
6. WHEN an Admin assigns or changes a user's permission level, THE Docs_System SHALL apply the new permissions immediately and log the change with the Admin identity and timestamp
7. IF an unauthenticated user attempts to access the Docs_System, THEN THE Docs_System SHALL redirect the user to the authentication page

### Requirement 6: Document Organization and Navigation

**User Story:** As a viewer, I want to browse and search documents easily, so that I can find the information I need without technical knowledge of the underlying system.

#### Acceptance Criteria

1. THE Docs_System SHALL organize documents into categories and subcategories configurable by an Admin
2. THE Docs_System SHALL provide a full-text search feature that returns matching documents ranked by relevance within 2 seconds for repositories of up to 10,000 documents
3. WHEN a Viewer enters a search query, THE Docs_System SHALL display matching results with the document title, category, a content snippet containing the matched text, and the last-modified date
4. THE Docs_System SHALL provide a navigation sidebar listing all categories and subcategories with expandable/collapsible sections

### Requirement 7: User Authentication

**User Story:** As a user, I want to log in securely using either my makerspace member credentials or an external OAuth provider, so that my identity is verified and my permissions are enforced.

#### Acceptance Criteria

1. THE Docs_System SHALL authenticate users via an OAuth 2.0 compatible identity provider
2. THE Docs_System SHALL authenticate users via the Makerspace_Member_API by accepting member credentials, calling the makerspace member system API, and receiving a session token containing the member's username
3. WHEN a user successfully authenticates via either method, THE Docs_System SHALL create a session and apply the user's assigned permission level
4. IF a user's session expires, THEN THE Docs_System SHALL require re-authentication before granting further access
5. THE Docs_System SHALL support integration with at least one external identity provider (e.g., Google, GitHub)
6. WHEN a user authenticates via the Makerspace_Member_API, THE Docs_System SHALL NOT derive any permission level from the member system; permissions SHALL be assigned manually within the Docs_System by an Admin

### Requirement 8: Admin-Approved Sensitive Pages

**User Story:** As an admin, I want certain organisational pages to require explicit admin approval before publication, so that sensitive content is vetted by an administrator rather than a general approver.

#### Acceptance Criteria

1. WHEN an Admin creates or edits a document, THE Docs_System SHALL allow the Admin to designate the document as a Sensitive_Page
2. WHEN an Edit_Proposal is submitted for a Sensitive_Page, THE Docs_System SHALL restrict approval to users with the Admin permission level and prevent Approvers from approving or rejecting the Edit_Proposal
3. WHEN an Edit_Proposal for a Sensitive_Page is created, THE Docs_System SHALL notify all Admins via email or in-app notification and exclude non-Admin Approvers from the notification
4. WHEN an Approver views an Edit_Proposal for a Sensitive_Page, THE Docs_System SHALL display the proposal in read-only mode with a notice that Admin approval is required
5. WHEN an Admin removes the Sensitive_Page designation from a document, THE Docs_System SHALL revert the document to the standard Approver-based approval workflow for all subsequent Edit_Proposals
6. THE Docs_System SHALL display a visible indicator on Sensitive_Pages in the navigation sidebar and document header to distinguish them from standard documents

### Requirement 9: Group-Based Visibility

**User Story:** As an admin, I want to restrict document visibility to specific groups, so that only authorised users at the appropriate organisational level can view certain pages.

#### Acceptance Criteria

1. THE Docs_System SHALL support five Group_Levels: Member, Non_Member, Team_Leader, Manager, and Board_Member
2. WHEN an Admin creates a Visibility_Group, THE Docs_System SHALL require the Admin to assign a name, a Group_Level, and at least one user to the Visibility_Group
3. WHEN an Admin assigns a Visibility_Group to a document, THE Docs_System SHALL restrict read access to users who belong to the assigned Visibility_Group
4. WHEN a user who does not belong to the assigned Visibility_Group attempts to access a restricted document, THE Docs_System SHALL deny access and display a message stating that the user does not have permission to view the document
5. WHEN an Admin assigns multiple Visibility_Groups to a single document, THE Docs_System SHALL grant read access to users who belong to any of the assigned Visibility_Groups
6. WHEN no Visibility_Group is assigned to a document, THE Docs_System SHALL apply the default visibility rules based on the user's permission level as defined in Requirement 5
7. WHEN an Admin adds or removes a user from a Visibility_Group, THE Docs_System SHALL apply the updated visibility permissions immediately
8. THE Docs_System SHALL allow an Admin to view and manage all Visibility_Groups, including their assigned Group_Level, member lists, and associated documents
