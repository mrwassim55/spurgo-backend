import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import entities
import { User } from '../src/modules/users/entities/user.entity';
import { SystemConfig } from '../src/modules/users/entities/system-config.entity';
import { EmailVerification } from '../src/modules/users/entities/email-verification.entity';
import { AdminNotification } from '../src/modules/users/entities/admin-notification.entity';
import { AccessoryRequest } from '../src/modules/requests/entities/accessory-request.entity';
import { Offer } from '../src/modules/offers/entities/offer.entity';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { Report } from '../src/modules/reports/entities/report.entity';

const entities = [
  SystemConfig,
  AdminNotification,
  EmailVerification,
  User,
  AccessoryRequest,
  Offer,
  Notification,
  Report,
];

async function migrate() {
  console.log('Starting DB migration from SQLite to PostgreSQL...');

  // 1. Initialize SQLite DataSource (Source)
  const sqliteSource = new DataSource({
    type: 'sqlite',
    database: path.join(__dirname, '../spurgo.db'),
    entities: entities,
    synchronize: false,
  });

  // 2. Initialize PostgreSQL DataSource (Target)
  const postgresTarget = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'spurgo',
    entities: entities,
    synchronize: true, // Auto-create tables on target PostgreSQL if not exist
  });

  try {
    console.log('Connecting to SQLite database...');
    await sqliteSource.initialize();
    console.log('Connected to SQLite.');

    console.log('Connecting to PostgreSQL database...');
    await postgresTarget.initialize();
    console.log('Connected to PostgreSQL.');

    // 3. Clear target tables to prevent duplicates
    console.log('Clearing existing target tables in reverse topological order...');
    const tables = [
      'reports',
      'notifications',
      'offers',
      'accessory_requests',
      'users',
      'email_verifications',
      'admin_notifications',
      'system_configs',
    ];
    for (const table of tables) {
      try {
        await postgresTarget.query(`TRUNCATE TABLE "${table}" CASCADE;`);
      } catch (err) {
        // Fallback for tables if truncate cascade is not supported or query fails
        console.warn(`Could not truncate table ${table}, attempting delete:`, err.message);
        try {
          await postgresTarget.query(`DELETE FROM "${table}";`);
        } catch (e) {
          console.error(`Failed to clear table ${table}:`, e.message);
        }
      }
    }

    // 4. Migrate SystemConfig
    console.log('Migrating SystemConfig...');
    const configs = await sqliteSource.getRepository(SystemConfig).find();
    console.log(`Found ${configs.length} configs.`);
    if (configs.length > 0) {
      await postgresTarget.getRepository(SystemConfig).save(configs);
    }

    // 5. Migrate AdminNotification
    console.log('Migrating AdminNotification...');
    const adminNotifications = await sqliteSource.getRepository(AdminNotification).find();
    console.log(`Found ${adminNotifications.length} admin notifications.`);
    if (adminNotifications.length > 0) {
      await postgresTarget.getRepository(AdminNotification).save(adminNotifications);
    }

    // 6. Migrate EmailVerification
    console.log('Migrating EmailVerification...');
    const verifications = await sqliteSource.getRepository(EmailVerification).find();
    console.log(`Found ${verifications.length} email verifications.`);
    if (verifications.length > 0) {
      await postgresTarget.getRepository(EmailVerification).save(verifications);
    }

    // 7. Migrate User
    console.log('Migrating Users...');
    const users = await sqliteSource.getRepository(User).find();
    console.log(`Found ${users.length} users.`);
    if (users.length > 0) {
      await postgresTarget.getRepository(User).save(users);
    }

    // 8. Migrate AccessoryRequest
    console.log('Migrating AccessoryRequests...');
    const requests = await sqliteSource.getRepository(AccessoryRequest).find({
      relations: ['user'],
    });
    console.log(`Found ${requests.length} accessory requests.`);
    if (requests.length > 0) {
      await postgresTarget.getRepository(AccessoryRequest).save(requests);
    }

    // 9. Migrate Offer
    console.log('Migrating Offers...');
    const offers = await sqliteSource.getRepository(Offer).find({
      relations: ['supplier', 'request'],
    });
    console.log(`Found ${offers.length} offers.`);
    if (offers.length > 0) {
      await postgresTarget.getRepository(Offer).save(offers);
    }

    // 10. Migrate Notification
    console.log('Migrating Notifications...');
    const notifications = await sqliteSource.getRepository(Notification).find();
    console.log(`Found ${notifications.length} notifications.`);
    if (notifications.length > 0) {
      await postgresTarget.getRepository(Notification).save(notifications);
    }

    // 11. Migrate Report
    console.log('Migrating Reports...');
    const reports = await sqliteSource.getRepository(Report).find();
    console.log(`Found ${reports.length} reports.`);
    if (reports.length > 0) {
      await postgresTarget.getRepository(Report).save(reports);
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    if (sqliteSource.isInitialized) {
      await sqliteSource.destroy();
    }
    if (postgresTarget.isInitialized) {
      await postgresTarget.destroy();
    }
  }
}

migrate();
