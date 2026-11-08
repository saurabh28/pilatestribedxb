import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const coachConnections=sqliteTable('coach_connections',{userId:text('user_id').primaryKey(),trainerId:text('trainer_id').notNull(),encryptedSession:text('encrypted_session').notNull(),expiresAt:integer('expires_at').notNull(),refreshLockUntil:integer('refresh_lock_until').notNull().default(0),updatedAt:text('updated_at').notNull()});

