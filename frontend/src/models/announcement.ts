export interface Announcement {
  id: number;
  title: string;
  content: string;
  tag: string;
  popup: boolean;
  pinned: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
