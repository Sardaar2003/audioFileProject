export type Role = 'User' | 'QA1' | 'QA2' | 'QAManager' | 'Admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface FilePair {
  _id: string;
  baseName: string;
  audioPath: string;
  textPath: string;
  uploaderName: string;
  status: 'Processing' | 'Completed';
  uploadedAt: string;
  completedAt?: string;
}

export interface UploadSummary {
  validPairs: number;
  uniqueFilenames: number;
  completedUploads: number;
}

export interface Assignment {
  _id: string;
  filePair: FilePair;
  assignedByName: string;
  assignedToName: string;
  teamTag: 'QA1' | 'QA2';
  assignedAt: string;
  status: 'Assigned' | 'Completed';
}

export interface Review {
  _id: string;
  reviewerName: string;
  teamTag: 'QA1' | 'QA2';
  soldStatus: 'Sold' | 'Unsold';
  status: 'Pending' | 'OK' | 'Issue';
  comment: string;
  reviewedAt: string;
  filePair: FilePair;
  assignedManagerName?: string;
}

export interface AdminStats {
  analytics: {
    totalUsers: number;
    totalFilePairs: number;
    processingCount: number;
    completedReviews: number;
  };
  uploads: FilePair[];
  assignments: Assignment[];
  reviews: Review[];
}


