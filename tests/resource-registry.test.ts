// tests/resource-registry.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface ResourceEntry {
  creator: string;
  timestamp: number;
  title: string;
  description: string;
  ipfsHash: string;
}

interface VersionEntry {
  updatedIpfsHash: string;
  updateNotes: string;
  timestamp: number;
}

interface CategoryEntry {
  category: string;
  tags: string[];
}

interface CollaboratorEntry {
  role: string;
  permissions: string[];
  addedAt: number;
}

interface StatusEntry {
  status: string;
  visibility: boolean;
  lastUpdated: number;
}

interface LicenseEntry {
  expiry: number;
  terms: string;
  active: boolean;
}

interface RevenueShareEntry {
  percentage: number;
  totalReceived: number;
}

interface ContractState {
  resourceRegistry: Map<string, ResourceEntry>;
  resourceVersions: Map<string, VersionEntry>; // Key: `${hash}_${version}`
  resourceCategories: Map<string, CategoryEntry>;
  resourceCollaborators: Map<string, CollaboratorEntry>; // Key: `${hash}_${collaborator}`
  resourceStatus: Map<string, StatusEntry>;
  resourceLicenses: Map<string, LicenseEntry>; // Key: `${hash}_${licensee}`
  resourceRevenueShares: Map<string, RevenueShareEntry>; // Key: `${hash}_${participant}`
  contractPaused: boolean;
  contractAdmin: string;
  totalResources: number;
  blockHeight: number; // Mock block height
}

// Mock contract implementation
class ResourceRegistryMock {
  private state: ContractState = {
    resourceRegistry: new Map(),
    resourceVersions: new Map(),
    resourceCategories: new Map(),
    resourceCollaborators: new Map(),
    resourceStatus: new Map(),
    resourceLicenses: new Map(),
    resourceRevenueShares: new Map(),
    contractPaused: false,
    contractAdmin: "deployer",
    totalResources: 0,
    blockHeight: 1000, // Starting mock block height
  };

  private ERR_ALREADY_REGISTERED = 100;
  private ERR_NOT_OWNER = 101;
  private ERR_INVALID_HASH = 102;
  private ERR_INVALID_METADATA = 103;
  private ERR_UNAUTHORIZED = 104;
  private ERR_PAUSED = 105;
  private ERR_INVALID_VERSION = 106;
  private ERR_INVALID_LICENSEE = 107;
  private ERR_INVALID_CATEGORY = 108;
  private ERR_INVALID_COLLABORATOR = 109;
  private ERR_INVALID_STATUS = 110;
  private ERR_INVALID_SHARE = 111;
  private ERR_MAX_LENGTH_EXCEEDED = 112;
  private MAX_TITLE_LEN = 100;
  private MAX_DESC_LEN = 1000;
  private MAX_TAGS = 10;
  private MAX_PERMISSIONS = 5;
  private MAX_UPDATE_NOTES_LEN = 500;
  private MAX_TERMS_LEN = 500;
  private MAX_ROLE_LEN = 50;
  private MAX_CATEGORY_LEN = 50;
  private MAX_TAG_LEN = 20;
  private MAX_PERM_LEN = 20;
  private MAX_STATUS_LEN = 20;

  // Helper to increment mock block height
  private incrementBlockHeight() {
    this.state.blockHeight += 1;
  }

  // Validation helpers
  private validateHash(hash: string): boolean {
    return hash.length === 64; // Assuming hex representation of buff 32
  }

  private validateStringLen(str: string, maxLen: number): boolean {
    return str.length <= maxLen;
  }

  private isOwner(resourceHash: string, caller: string): boolean {
    const entry = this.state.resourceRegistry.get(resourceHash);
    return !!entry && entry.creator === caller;
  }

  registerResource(
    caller: string,
    resourceHash: string,
    title: string,
    description: string,
    ipfsHash: string
  ): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (this.state.resourceRegistry.has(resourceHash)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    if (
      !this.validateHash(resourceHash) ||
      !this.validateStringLen(title, this.MAX_TITLE_LEN) ||
      !this.validateStringLen(description, this.MAX_DESC_LEN) ||
      ipfsHash.length === 0
    ) {
      return { ok: false, value: this.ERR_INVALID_METADATA };
    }
    this.state.resourceRegistry.set(resourceHash, {
      creator: caller,
      timestamp: this.state.blockHeight,
      title,
      description,
      ipfsHash,
    });
    this.state.resourceStatus.set(resourceHash, {
      status: "draft",
      visibility: false,
      lastUpdated: this.state.blockHeight,
    });
    this.state.totalResources += 1;
    return { ok: true, value: true };
  }

  transferOwnership(
    caller: string,
    resourceHash: string,
    newOwner: string
  ): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const entry = this.state.resourceRegistry.get(resourceHash);
    if (!entry) {
      return { ok: false, value: this.ERR_INVALID_HASH };
    }
    if (entry.creator !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.resourceRegistry.set(resourceHash, { ...entry, creator: newOwner });
    return { ok: true, value: true };
  }

  registerVersion(
    caller: string,
    resourceHash: string,
    version: number,
    updatedIpfsHash: string,
    updateNotes: string
  ): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isOwner(resourceHash, caller)) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (
      version === 0 ||
      !this.validateStringLen(updateNotes, this.MAX_UPDATE_NOTES_LEN) ||
      updatedIpfsHash.length === 0
    ) {
      return { ok: false, value: this.ERR_INVALID_METADATA };
    }
    const versionKey = `${resourceHash}_${version}`;
    if (this.state.resourceVersions.has(versionKey)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    this.state.resourceVersions.set(versionKey, {
      updatedIpfsHash,
      updateNotes,
      timestamp: this.state.blockHeight,
    });
    const status = this.state.resourceStatus.get(resourceHash);
    if (status) {
      this.state.resourceStatus.set(resourceHash, { ...status, lastUpdated: this.state.blockHeight });
    }
    return { ok: true, value: true };
  }

  grantLicense(
    caller: string,
    resourceHash: string,
    licensee: string,
    duration: number,
    terms: string
  ): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isOwner(resourceHash, caller)) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (
      licensee === caller ||
      !this.validateStringLen(terms, this.MAX_TERMS_LEN) ||
      duration === 0
    ) {
      return { ok: false, value: this.ERR_INVALID_LICENSEE };
    }
    const licenseKey = `${resourceHash}_${licensee}`;
    this.state.resourceLicenses.set(licenseKey, {
      expiry: this.state.blockHeight + duration,
      terms,
      active: true,
    });
    return { ok: true, value: true };
  }

  addCategory(
    caller: string,
    resourceHash: string,
    category: string,
    tags: string[]
  ): ClarityResponse<boolean> {
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isOwner(resourceHash, caller)) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (
      !this.validateStringLen(category, this.MAX_CATEGORY_LEN) ||
      tags.length > this.MAX_TAGS ||
      !tags.every((tag) => tag.length <= this.MAX_TAG_LEN)
    ) {
      return { ok: false, value: this.ERR_INVALID_CATEGORY };
    }
    this.state.resourceCategories.set(resourceHash, { category, tags });
    return { ok: true, value: true };
  }

  addCollaborator(
    caller: string,
    resourceHash: string,
    collaborator: string,
    role: string,
    permissions: string[]
  ): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isOwner(resourceHash, caller)) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (
      collaborator === caller ||
      !this.validateStringLen(role, this.MAX_ROLE_LEN) ||
      permissions.length > this.MAX_PERMISSIONS ||
      !permissions.every((perm) => perm.length <= this.MAX_PERM_LEN)
    ) {
      return { ok: false, value: this.ERR_INVALID_COLLABORATOR };
    }
    const collabKey = `${resourceHash}_${collaborator}`;
    this.state.resourceCollaborators.set(collabKey, {
      role,
      permissions,
      addedAt: this.state.blockHeight,
    });
    return { ok: true, value: true };
  }

  updateStatus(
    caller: string,
    resourceHash: string,
    newStatus: string,
    visibility: boolean
  ): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isOwner(resourceHash, caller)) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (!this.validateStringLen(newStatus, this.MAX_STATUS_LEN)) {
      return { ok: false, value: this.ERR_INVALID_STATUS };
    }
    this.state.resourceStatus.set(resourceHash, {
      status: newStatus,
      visibility,
      lastUpdated: this.state.blockHeight,
    });
    return { ok: true, value: true };
  }

  setRevenueShare(
    caller: string,
    resourceHash: string,
    participant: string,
    percentage: number
  ): ClarityResponse<boolean> {
    if (this.state.contractPaused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isOwner(resourceHash, caller)) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (percentage > 100 || percentage === 0 || participant === caller) {
      return { ok: false, value: this.ERR_INVALID_SHARE };
    }
    const shareKey = `${resourceHash}_${participant}`;
    this.state.resourceRevenueShares.set(shareKey, {
      percentage,
      totalReceived: 0,
    });
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractAdmin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.contractPaused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractAdmin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.contractPaused = false;
    return { ok: true, value: true };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractAdmin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.contractAdmin = newAdmin;
    return { ok: true, value: true };
  }

  getResourceDetails(resourceHash: string): ClarityResponse<ResourceEntry | null> {
    return { ok: true, value: this.state.resourceRegistry.get(resourceHash) ?? null };
  }

  getResourceVersion(resourceHash: string, version: number): ClarityResponse<VersionEntry | null> {
    const versionKey = `${resourceHash}_${version}`;
    return { ok: true, value: this.state.resourceVersions.get(versionKey) ?? null };
  }

  getResourceCategory(resourceHash: string): ClarityResponse<CategoryEntry | null> {
    return { ok: true, value: this.state.resourceCategories.get(resourceHash) ?? null };
  }

  getResourceCollaborator(resourceHash: string, collaborator: string): ClarityResponse<CollaboratorEntry | null> {
    const collabKey = `${resourceHash}_${collaborator}`;
    return { ok: true, value: this.state.resourceCollaborators.get(collabKey) ?? null };
  }

  getResourceStatus(resourceHash: string): ClarityResponse<StatusEntry | null> {
    return { ok: true, value: this.state.resourceStatus.get(resourceHash) ?? null };
  }

  getResourceLicense(resourceHash: string, licensee: string): ClarityResponse<LicenseEntry | null> {
    const licenseKey = `${resourceHash}_${licensee}`;
    return { ok: true, value: this.state.resourceLicenses.get(licenseKey) ?? null };
  }

  getResourceRevenueShare(resourceHash: string, participant: string): ClarityResponse<RevenueShareEntry | null> {
    const shareKey = `${resourceHash}_${participant}`;
    return { ok: true, value: this.state.resourceRevenueShares.get(shareKey) ?? null };
  }

  getTotalResources(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalResources };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.contractPaused };
  }

  getContractAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.contractAdmin };
  }

  verifyCreator(resourceHash: string, creator: string): ClarityResponse<boolean> {
    const entry = this.state.resourceRegistry.get(resourceHash);
    return { ok: true, value: !!entry && entry.creator === creator };
  }

  checkLicenseActive(resourceHash: string, licensee: string): ClarityResponse<boolean> {
    const licenseKey = `${resourceHash}_${licensee}`;
    const license = this.state.resourceLicenses.get(licenseKey);
    return { ok: true, value: !!license && license.active && license.expiry >= this.state.blockHeight };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  creator: "wallet_1",
  user1: "wallet_2",
  user2: "wallet_3",
};

describe("ResourceRegistry Contract", () => {
  let contract: ResourceRegistryMock;

  beforeEach(() => {
    contract = new ResourceRegistryMock();
    vi.resetAllMocks();
  });

  it("should register a new resource successfully", () => {
    const result = contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Test Title",
      "Test Description",
      "ipfs://test"
    );
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getTotalResources()).toEqual({ ok: true, value: 1 });
    const details = contract.getResourceDetails("a".repeat(64));
    expect(details).toEqual({
      ok: true,
      value: expect.objectContaining({
        creator: accounts.creator,
        title: "Test Title",
        description: "Test Description",
        ipfsHash: "ipfs://test",
      }),
    });
    const status = contract.getResourceStatus("a".repeat(64));
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "draft", visibility: false }),
    });
  });

  it("should prevent registering duplicate resource", () => {
    contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Test Title",
      "Test Description",
      "ipfs://test"
    );
    const duplicate = contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Duplicate",
      "Desc",
      "ipfs://dup"
    );
    expect(duplicate).toEqual({ ok: false, value: 100 });
  });

  it("should prevent registration with invalid metadata", () => {
    const invalidHash = contract.registerResource(
      accounts.creator,
      "invalid",
      "Title",
      "Desc",
      "ipfs://test"
    );
    expect(invalidHash).toEqual({ ok: false, value: 103 });
  });

  it("should allow ownership transfer", () => {
    contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Title",
      "Desc",
      "ipfs://test"
    );
    const transfer = contract.transferOwnership(
      accounts.creator,
      "a".repeat(64),
      accounts.user1
    );
    expect(transfer).toEqual({ ok: true, value: true });
    const details = contract.getResourceDetails("a".repeat(64));
    expect(details.value?.creator).toBe(accounts.user1);
  });

  it("should prevent non-owner from transferring ownership", () => {
    contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Title",
      "Desc",
      "ipfs://test"
    );
    const transfer = contract.transferOwnership(
      accounts.user1,
      "a".repeat(64),
      accounts.user2
    );
    expect(transfer).toEqual({ ok: false, value: 101 });
  });

  it("should register a new version", () => {
    contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Title",
      "Desc",
      "ipfs://test"
    );
    const version = contract.registerVersion(
      accounts.creator,
      "a".repeat(64),
      1,
      "ipfs://updated",
      "Update notes"
    );
    expect(version).toEqual({ ok: true, value: true });
    const versionDetails = contract.getResourceVersion("a".repeat(64), 1);
    expect(versionDetails).toEqual({
      ok: true,
      value: expect.objectContaining({ updatedIpfsHash: "ipfs://updated", updateNotes: "Update notes" }),
    });
  });

  it("should grant a license", () => {
    contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Title",
      "Desc",
      "ipfs://test"
    );
    const license = contract.grantLicense(
      accounts.creator,
      "a".repeat(64),
      accounts.user1,
      1000,
      "License terms"
    );
    expect(license).toEqual({ ok: true, value: true });
    const licenseDetails = contract.getResourceLicense("a".repeat(64), accounts.user1);
    expect(licenseDetails).toEqual({
      ok: true,
      value: expect.objectContaining({ terms: "License terms", active: true }),
    });
    const active = contract.checkLicenseActive("a".repeat(64), accounts.user1);
    expect(active).toEqual({ ok: true, value: true });
  });

  it("should add category and tags", () => {
    contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Title",
      "Desc",
      "ipfs://test"
    );
    const category = contract.addCategory(
      accounts.creator,
      "a".repeat(64),
      "Science",
      ["tag1", "tag2"]
    );
    expect(category).toEqual({ ok: true, value: true });
    const catDetails = contract.getResourceCategory("a".repeat(64));
    expect(catDetails).toEqual({
      ok: true,
      value: { category: "Science", tags: ["tag1", "tag2"] },
    });
  });

  it("should add collaborator", () => {
    contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Title",
      "Desc",
      "ipfs://test"
    );
    const collab = contract.addCollaborator(
      accounts.creator,
      "a".repeat(64),
      accounts.user1,
      "Editor",
      ["edit", "review"]
    );
    expect(collab).toEqual({ ok: true, value: true });
    const collabDetails = contract.getResourceCollaborator("a".repeat(64), accounts.user1);
    expect(collabDetails).toEqual({
      ok: true,
      value: expect.objectContaining({ role: "Editor", permissions: ["edit", "review"] }),
    });
  });

  it("should update status", () => {
    contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Title",
      "Desc",
      "ipfs://test"
    );
    const update = contract.updateStatus(
      accounts.creator,
      "a".repeat(64),
      "submitted",
      true
    );
    expect(update).toEqual({ ok: true, value: true });
    const status = contract.getResourceStatus("a".repeat(64));
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "submitted", visibility: true }),
    });
  });

  it("should set revenue share", () => {
    contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Title",
      "Desc",
      "ipfs://test"
    );
    const share = contract.setRevenueShare(
      accounts.creator,
      "a".repeat(64),
      accounts.user1,
      20
    );
    expect(share).toEqual({ ok: true, value: true });
    const shareDetails = contract.getResourceRevenueShare("a".repeat(64), accounts.user1);
    expect(shareDetails).toEqual({
      ok: true,
      value: { percentage: 20, totalReceived: 0 },
    });
  });

  it("should pause and unpause contract", () => {
    const pause = contract.pauseContract(accounts.deployer);
    expect(pause).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: true });

    const registerDuringPause = contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Title",
      "Desc",
      "ipfs://test"
    );
    expect(registerDuringPause).toEqual({ ok: false, value: 105 });

    const unpause = contract.unpauseContract(accounts.deployer);
    expect(unpause).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent unauthorized admin actions", () => {
    const pause = contract.pauseContract(accounts.user1);
    expect(pause).toEqual({ ok: false, value: 104 });
  });

  it("should verify creator correctly", () => {
    contract.registerResource(
      accounts.creator,
      "a".repeat(64),
      "Title",
      "Desc",
      "ipfs://test"
    );
    const verify = contract.verifyCreator("a".repeat(64), accounts.creator);
    expect(verify).toEqual({ ok: true, value: true });
    const wrong = contract.verifyCreator("a".repeat(64), accounts.user1);
    expect(wrong).toEqual({ ok: true, value: false });
  });
});