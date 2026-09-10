export interface User {
  username: string;
  displayName?: string;
  profileUrl: string;
}

export type ListKind = "followers" | "following" | "likes";

export interface Classification {
  category: string;
  confidence: number;
  model: string;
  classifiedAt: string;
}

export interface ProfileRecord extends User {
  firstSeen: string;
  lastSeen: string;
  ai?: Classification;
}

export interface Snapshot {
  id: string;
  subject: string;
  kind: ListKind;
  takenAt: string;
  usernames: string[];
}

export interface StoreData {
  version: 1;
  subject?: string;
  profiles: Record<string, ProfileRecord>;
  snapshots: Snapshot[];
}
