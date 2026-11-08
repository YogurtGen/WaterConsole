export interface InstalledStoreGame {
  key: string;
  store: "steam" | "epic";
  storeId: string;
  namespace?: string;
  appName?: string;
  name: string;
  directory: string;
  executable?: string;
  executables: string[];
  alreadyAdded: boolean;
  needsReview: boolean;
}
export interface StoreReference {
  store: "steam" | "epic";
  id: string;
  namespace?: string;
  appName?: string;
}
export interface StoreScan {
  games: InstalledStoreGame[];
  notes: string[];
}
