const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.resolve(__dirname, 'spurgo.db');
const db = new sqlite3.Database(dbPath);

const defaultPassword = 'password123';
const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

const testUsers = [
  {
    email: 'admin@spurgo.io',
    fullName: 'Admin Spurgo',
    role: 'admin',
    phoneNumber: '+218910000001',
    whatsapp: '+218910000001',
    points: 9999,
  },
  {
    email: 'moderator@spurgo.io',
    fullName: 'Moderator Spurgo',
    role: 'moderator',
    phoneNumber: '+218910000002',
    whatsapp: '+218910000002',
    points: 5000,
  },
  {
    email: 'staff@spurgo.io',
    fullName: 'Staff Spurgo',
    role: 'staff',
    phoneNumber: '+218910000003',
    whatsapp: '+218910000003',
    points: 5000,
  },
  {
    email: 'supplier@spurgo.io',
    fullName: 'Pro Auto Supplier',
    role: 'supplier',
    companyName: 'Spurgo Auto Parts Co.',
    specializations: 'German, Japanese, Korean, American',
    taxId: 'TAX-SPURGO-SUPPLIER-01',
    phoneNumber: '+218910000004',
    whatsapp: '+218910000004',
    points: 2000,
  },
  {
    email: 'customer@spurgo.io',
    fullName: 'Spurgo Customer',
    role: 'customer',
    phoneNumber: '+218910000005',
    whatsapp: '+218910000005',
    points: 1000,
  },
];

db.serialize(() => {
  console.log('--- Seeding & Validating Test Accounts ---');

  for (const u of testUsers) {
    db.get('SELECT id FROM users WHERE email = ?', [u.email], (err, row) => {
      if (err) {
        console.error('Error fetching user ' + u.email, err);
        return;
      }

      if (row) {
        // Update user to active, approved, verified with password
        db.run(
          `UPDATE users SET 
            password = ?, 
            fullName = ?, 
            role = ?, 
            phoneNumber = ?, 
            whatsapp = ?, 
            points = ?, 
            isActive = 1, 
            isApproved = 1, 
            isEmailVerified = 1, 
            verificationStatus = 'approved',
            region = 'Sabratha',
            city = 'Sabratha',
            address = 'City Center',
            companyName = ?,
            specializations = ?,
            taxId = ?
          WHERE id = ?`,
          [
            hashedPassword,
            u.fullName,
            u.role,
            u.phoneNumber,
            u.whatsapp,
            u.points,
            u.companyName || null,
            u.specializations || null,
            u.taxId || null,
            row.id,
          ],
          (updateErr) => {
            if (updateErr) {
              console.error('Failed to update ' + u.email, updateErr);
            } else {
              console.log(`[UPDATED & VALIDATED] ${u.role.toUpperCase()}: ${u.email} (Password: ${defaultPassword})`);
            }
          }
        );
      } else {
        // Insert new user
        const newId = crypto.randomUUID();
        db.run(
          `INSERT INTO users (
            id, email, password, fullName, role, phoneNumber, whatsapp, points, 
            isActive, isApproved, isEmailVerified, verificationStatus,
            region, city, address, companyName, specializations, taxId,
            createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 'approved', 'Sabratha', 'Sabratha', 'City Center', ?, ?, ?, datetime('now'), datetime('now'))`,
          [
            newId,
            u.email,
            hashedPassword,
            u.fullName,
            u.role,
            u.phoneNumber,
            u.whatsapp,
            u.points,
            u.companyName || null,
            u.specializations || null,
            u.taxId || null,
          ],
          (insertErr) => {
            if (insertErr) {
              console.error('Failed to insert ' + u.email, insertErr);
            } else {
              console.log(`[CREATED & VALIDATED] ${u.role.toUpperCase()}: ${u.email} (Password: ${defaultPassword})`);
            }
          }
        );
      }
    });
  }

  // Also ensure existing users (wassim & bahaa) are active, approved, verified
  db.run(
    `UPDATE users SET password = ?, isActive = 1, isApproved = 1, isEmailVerified = 1, verificationStatus = 'approved' 
     WHERE email = 'wassim.benchaoua@gmail.com'`,
    [hashedPassword],
    (err) => {
      if (!err) {
        console.log('[CONFIRMED] wassim.benchaoua@gmail.com updated with password: ' + defaultPassword);
      }
    }
  );

  db.run(
    `UPDATE users SET password = ?, isActive = 1, isApproved = 1, isEmailVerified = 1, verificationStatus = 'approved' 
     WHERE email = 'bahaa.kafo@gmail.com'`,
    [hashedPassword],
    (err) => {
      if (!err) {
        console.log('[CONFIRMED] bahaa.kafo@gmail.com updated with password: ' + defaultPassword);
      }
    }
  );
});

// Close database after operations
setTimeout(() => {
  db.close(() => {
    console.log('Done!');
  });
}, 1500);
