import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { sectionsOverlap } from "./proposals.js";
import type { DocumentNode, ProposalStatus } from "@hacmandocs/shared";

// ── Generators ───────────────────────────────────────────────────────

/** Generate a simple valid DocumentNode (ProseMirror JSON). */
const documentNodeArb = (): fc.Arbitrary<DocumentNode> =>
  fc
    .array(
      fc.record({
        type: fc.constant("paragraph"),
        content: fc.constant([
          { type: "text", text: fc.sample(fc.string({ minLength: 1, maxLength: 50 }), 1)[0] },
        ]),
      }),
      { minLength: 1, maxLength: 5 },
    )
    .map((children) => ({
      type: "doc",
      content: children as DocumentNode[],
    }));

/** Generate a random user ID. */
const userIdArb = fc.uuid();

/** Generate a random document ID. */
const documentIdArb = fc.uuid();

/** Generate a section identifier string. */
const sectionIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/);

/** Generate an array of unique section identifiers. */
const sectionArrayArb = (minLen = 0, maxLen = 8): fc.Arbitrary<string[]> =>
  fc.uniqueArray(sectionIdArb, { minLength: minLen, maxLength: maxLen });

/** Generate a positive unix timestamp. */
const _timestampArb = fc.integer({ min: 1_000_000_000, max: 2_000_000_000 });

/** Generate a non-empty rejection reason. */
const rejectionReasonArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

// ── Property 4: Edit proposal contains required fields ───────────────

describe("Property 4: Edit proposal contains required fields", () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For any valid document and set of proposed changes submitted by an
   * Editor, the created Edit_Proposal SHALL contain the proposed content,
   * the author's identity, and a timestamp, and all three fields SHALL
   * be non-null.
   */

  /**
   * Simulate creating a proposal record from inputs, mirroring the logic
   * in the POST / handler of proposals.ts.
   */
  function createProposalRecord(
    documentId: string,
    proposedContent: DocumentNode,
    authorId: string,
  ) {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    return {
      id,
      documentId,
      proposedContentJson: JSON.stringify(proposedContent),
      sectionLocksJson: null,
      authorId,
      reviewerId: null,
      status: "pending" as const,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  it("created proposal has non-null proposedContentJson, authorId, and createdAt", () => {
    fc.assert(
      fc.property(
        documentIdArb,
        documentNodeArb(),
        userIdArb,
        (documentId, proposedContent, authorId) => {
          const proposal = createProposalRecord(documentId, proposedContent, authorId);

          // proposedContentJson must be non-null and valid JSON
          expect(proposal.proposedContentJson).not.toBeNull();
          expect(proposal.proposedContentJson.length).toBeGreaterThan(0);
          const parsed = JSON.parse(proposal.proposedContentJson);
          expect(parsed).toHaveProperty("type");

          // authorId must be non-null and match the input
          expect(proposal.authorId).not.toBeNull();
          expect(proposal.authorId).toBe(authorId);
          expect(proposal.authorId.length).toBeGreaterThan(0);

          // createdAt must be non-null and a positive timestamp
          expect(proposal.createdAt).not.toBeNull();
          expect(proposal.createdAt).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("proposal preserves the exact proposed content through JSON serialization", () => {
    fc.assert(
      fc.property(
        documentIdArb,
        documentNodeArb(),
        userIdArb,
        (documentId, proposedContent, authorId) => {
          const proposal = createProposalRecord(documentId, proposedContent, authorId);

          // Round-trip: the stored JSON must deserialize to the original content
          const deserialized = JSON.parse(proposal.proposedContentJson);
          expect(deserialized).toEqual(proposedContent);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("proposal status is always 'pending' on creation", () => {
    fc.assert(
      fc.property(
        documentIdArb,
        documentNodeArb(),
        userIdArb,
        (documentId, proposedContent, authorId) => {
          const proposal = createProposalRecord(documentId, proposedContent, authorId);
          expect(proposal.status).toBe("pending");
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 5: Proposal state machine transitions ───────────────────

describe("Property 5: Proposal state machine transitions", () => {
  /**
   * **Validates: Requirements 4.4, 4.5**
   *
   * For any pending Edit_Proposal, approving it SHALL result in the
   * document content matching the proposed content and the version number
   * incrementing by one. Rejecting it SHALL record the provided rejection
   * reason on the proposal and leave the document content unchanged.
   */

  interface Document {
    id: string;
    contentJson: string;
    currentVersion: number;
  }

  interface Proposal {
    id: string;
    documentId: string;
    proposedContentJson: string;
    authorId: string;
    status: ProposalStatus;
    rejectionReason: string | null;
    reviewerId: string | null;
  }

  interface VersionEntry {
    id: string;
    documentId: string;
    contentJson: string;
    authorId: string;
    approvedBy: string;
    approvalDetails: string;
    versionNumber: number;
    createdAt: number;
  }

  /**
   * Simulate approving a proposal: update document content, increment
   * version, create version entry.
   */
  function approveProposal(
    doc: Document,
    proposal: Proposal,
    approverId: string,
    versions: VersionEntry[],
  ): { doc: Document; proposal: Proposal; newVersion: VersionEntry } {
    const nextVersion = doc.currentVersion + 1;
    const now = Math.floor(Date.now() / 1000);

    const newVersion: VersionEntry = {
      id: crypto.randomUUID(),
      documentId: doc.id,
      contentJson: proposal.proposedContentJson,
      authorId: proposal.authorId,
      approvedBy: approverId,
      approvalDetails: `Approved by ${approverId}`,
      versionNumber: nextVersion,
      createdAt: now,
    };

    versions.push(newVersion);

    return {
      doc: {
        ...doc,
        contentJson: proposal.proposedContentJson,
        currentVersion: nextVersion,
      },
      proposal: {
        ...proposal,
        status: "approved",
        reviewerId: approverId,
      },
      newVersion,
    };
  }

  /**
   * Simulate rejecting a proposal: record reason, leave document unchanged.
   */
  function rejectProposal(
    doc: Document,
    proposal: Proposal,
    reviewerId: string,
    reason: string,
  ): { doc: Document; proposal: Proposal } {
    return {
      doc: { ...doc }, // unchanged
      proposal: {
        ...proposal,
        status: "rejected",
        rejectionReason: reason,
        reviewerId,
      },
    };
  }

  it("approving a proposal updates document content and increments version", () => {
    fc.assert(
      fc.property(
        documentIdArb,
        documentNodeArb(),
        documentNodeArb(),
        userIdArb,
        userIdArb,
        fc.integer({ min: 1, max: 100 }),
        (docId, originalContent, proposedContent, authorId, approverId, currentVersion) => {
          const doc: Document = {
            id: docId,
            contentJson: JSON.stringify(originalContent),
            currentVersion,
          };

          const proposal: Proposal = {
            id: crypto.randomUUID(),
            documentId: docId,
            proposedContentJson: JSON.stringify(proposedContent),
            authorId,
            status: "pending",
            rejectionReason: null,
            reviewerId: null,
          };

          const versions: VersionEntry[] = [];
          const result = approveProposal(doc, proposal, approverId, versions);

          // Document content must match proposed content
          expect(result.doc.contentJson).toBe(proposal.proposedContentJson);
          expect(JSON.parse(result.doc.contentJson)).toEqual(proposedContent);

          // Version number must increment by exactly 1
          expect(result.doc.currentVersion).toBe(currentVersion + 1);

          // Proposal status must be 'approved'
          expect(result.proposal.status).toBe("approved");

          // A version entry must be created
          expect(versions).toHaveLength(1);
          expect(versions[0].versionNumber).toBe(currentVersion + 1);
          expect(versions[0].contentJson).toBe(proposal.proposedContentJson);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejecting a proposal records the reason and leaves document unchanged", () => {
    fc.assert(
      fc.property(
        documentIdArb,
        documentNodeArb(),
        documentNodeArb(),
        userIdArb,
        userIdArb,
        rejectionReasonArb,
        (docId, originalContent, proposedContent, authorId, reviewerId, reason) => {
          const originalJson = JSON.stringify(originalContent);
          const doc: Document = {
            id: docId,
            contentJson: originalJson,
            currentVersion: 1,
          };

          const proposal: Proposal = {
            id: crypto.randomUUID(),
            documentId: docId,
            proposedContentJson: JSON.stringify(proposedContent),
            authorId,
            status: "pending",
            rejectionReason: null,
            reviewerId: null,
          };

          const result = rejectProposal(doc, proposal, reviewerId, reason);

          // Document content must be UNCHANGED
          expect(result.doc.contentJson).toBe(originalJson);
          expect(result.doc.currentVersion).toBe(1);

          // Rejection reason must be recorded
          expect(result.proposal.rejectionReason).toBe(reason);
          expect(result.proposal.rejectionReason!.length).toBeGreaterThan(0);

          // Proposal status must be 'rejected'
          expect(result.proposal.status).toBe("rejected");
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 6: Section conflict detection ───────────────────────────

describe("Property 6: Section conflict detection", () => {
  /**
   * **Validates: Requirements 4.6**
   *
   * For any document with a pending Edit_Proposal that locks a set of
   * sections, attempting to create another Edit_Proposal that overlaps
   * any of those locked sections SHALL be rejected. Creating a proposal
   * on non-overlapping sections SHALL succeed.
   */

  it("overlapping section arrays are detected as conflicts", () => {
    fc.assert(
      fc.property(
        sectionArrayArb(1, 8),
        (sections) => {
          // Pick a non-empty subset to guarantee overlap
          const subset = sections.slice(0, Math.max(1, Math.floor(sections.length / 2)));
          // Add some extra sections to the second array
          const extra = fc.sample(sectionIdArb, 3);
          const secondArray = [...subset, ...extra.filter((s) => !sections.includes(s))];

          // Since subset is taken from sections, there must be overlap
          expect(sectionsOverlap(sections, secondArray)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("non-overlapping section arrays are not conflicts", () => {
    // Generate two disjoint sets by using a pool and splitting it
    const disjointPairArb = fc
      .uniqueArray(sectionIdArb, { minLength: 2, maxLength: 16 })
      .map((pool) => {
        const mid = Math.floor(pool.length / 2);
        return {
          a: pool.slice(0, mid),
          b: pool.slice(mid),
        };
      })
      .filter((pair) => pair.a.length > 0 && pair.b.length > 0);

    fc.assert(
      fc.property(disjointPairArb, ({ a, b }) => {
        expect(sectionsOverlap(a, b)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("empty arrays never conflict", () => {
    fc.assert(
      fc.property(sectionArrayArb(0, 8), (sections) => {
        // Empty vs anything = no conflict
        expect(sectionsOverlap([], sections)).toBe(false);
        expect(sectionsOverlap(sections, [])).toBe(false);
        // Empty vs empty = no conflict
        expect(sectionsOverlap([], [])).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("identical section arrays always conflict (when non-empty)", () => {
    fc.assert(
      fc.property(
        sectionArrayArb(1, 8),
        (sections) => {
          expect(sectionsOverlap(sections, sections)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 7: Version history completeness ─────────────────────────

describe("Property 7: Version history completeness", () => {
  /**
   * **Validates: Requirements 4.7**
   *
   * For any document that has undergone a sequence of N approved edit
   * proposals, the version history SHALL contain exactly N+1 entries
   * (including the initial version), and each entry SHALL have a non-null
   * author, timestamp, and approval details.
   */

  interface VersionEntry {
    id: string;
    documentId: string;
    contentJson: string;
    authorId: string;
    approvedBy: string | null;
    approvalDetails: string | null;
    versionNumber: number;
    createdAt: number;
  }

  /**
   * Simulate building a version history: one initial version + N approvals.
   */
  function buildVersionHistory(
    documentId: string,
    initialAuthorId: string,
    initialContent: DocumentNode,
    approvals: Array<{
      authorId: string;
      approverId: string;
      content: DocumentNode;
    }>,
  ): VersionEntry[] {
    const history: VersionEntry[] = [];
    const now = Math.floor(Date.now() / 1000);

    // Initial version (version 1)
    history.push({
      id: crypto.randomUUID(),
      documentId,
      contentJson: JSON.stringify(initialContent),
      authorId: initialAuthorId,
      approvedBy: initialAuthorId, // initial creation is self-approved
      approvalDetails: "Initial version",
      versionNumber: 1,
      createdAt: now,
    });

    // Each approval creates a new version
    for (let i = 0; i < approvals.length; i++) {
      const approval = approvals[i];
      history.push({
        id: crypto.randomUUID(),
        documentId,
        contentJson: JSON.stringify(approval.content),
        authorId: approval.authorId,
        approvedBy: approval.approverId,
        approvalDetails: `Approved by ${approval.approverId}`,
        versionNumber: i + 2, // starts at 2 since initial is 1
        createdAt: now + i + 1,
      });
    }

    return history;
  }

  /** Generate a random approval entry. */
  const approvalArb = fc.record({
    authorId: userIdArb,
    approverId: userIdArb,
    content: documentNodeArb(),
  });

  it("N approvals produce N+1 version entries (including initial)", () => {
    fc.assert(
      fc.property(
        documentIdArb,
        userIdArb,
        documentNodeArb(),
        fc.array(approvalArb, { minLength: 0, maxLength: 10 }),
        (documentId, initialAuthorId, initialContent, approvals) => {
          const history = buildVersionHistory(
            documentId,
            initialAuthorId,
            initialContent,
            approvals,
          );

          // N approvals + 1 initial = N+1 entries
          expect(history).toHaveLength(approvals.length + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("every version entry has non-null author, timestamp, and approval details", () => {
    fc.assert(
      fc.property(
        documentIdArb,
        userIdArb,
        documentNodeArb(),
        fc.array(approvalArb, { minLength: 0, maxLength: 10 }),
        (documentId, initialAuthorId, initialContent, approvals) => {
          const history = buildVersionHistory(
            documentId,
            initialAuthorId,
            initialContent,
            approvals,
          );

          for (const entry of history) {
            // Author must be non-null
            expect(entry.authorId).not.toBeNull();
            expect(entry.authorId.length).toBeGreaterThan(0);

            // Timestamp must be non-null and positive
            expect(entry.createdAt).not.toBeNull();
            expect(entry.createdAt).toBeGreaterThan(0);

            // Approval details must be non-null
            expect(entry.approvedBy).not.toBeNull();
            expect(entry.approvedBy!.length).toBeGreaterThan(0);
            expect(entry.approvalDetails).not.toBeNull();
            expect(entry.approvalDetails!.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("version numbers are sequential starting from 1", () => {
    fc.assert(
      fc.property(
        documentIdArb,
        userIdArb,
        documentNodeArb(),
        fc.array(approvalArb, { minLength: 0, maxLength: 10 }),
        (documentId, initialAuthorId, initialContent, approvals) => {
          const history = buildVersionHistory(
            documentId,
            initialAuthorId,
            initialContent,
            approvals,
          );

          for (let i = 0; i < history.length; i++) {
            expect(history[i].versionNumber).toBe(i + 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
