export interface ConflictInfo {
    hasConflict: boolean;
    conflictType?: 'conflict' | 'overwrite' | 'unknown';
    modifiedBy?: string;
    modifiedDate?: string;
    reason?: string;
}