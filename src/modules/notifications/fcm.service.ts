import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private isInitialized = false;

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (getApps().length > 0) {
      this.isInitialized = true;
      return;
    }

    try {
      // 1. Check for environment variable
      const envServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (envServiceAccount) {
        const serviceAccount = JSON.parse(envServiceAccount);
        initializeApp({
          credential: cert(serviceAccount),
        });
        this.isInitialized = true;
        this.logger.log('🔥 Firebase Admin initialized successfully via ENV variable.');
        return;
      }

      // 2. Check for local file (supporting single or double .json extension)
      const possiblePaths = [
        path.resolve(process.cwd(), 'firebase-service-account.json'),
        path.resolve(process.cwd(), 'firebase-service-account.json.json'),
      ];

      for (const serviceAccountPath of possiblePaths) {
        if (fs.existsSync(serviceAccountPath)) {
          const serviceAccount = JSON.parse(
            fs.readFileSync(serviceAccountPath, 'utf8'),
          );
          initializeApp({
            credential: cert(serviceAccount),
          });
          this.isInitialized = true;
          this.logger.log(
            `🔥 Firebase Admin initialized successfully via ${path.basename(serviceAccountPath)} file.`,
          );
          return;
        }
      }

      this.logger.warn(
        '⚠️ Firebase Admin service account not found. FCM Push Notifications will run in graceful fallback mode until firebase-service-account.json is added.',
      );
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK:', error);
    }
  }

  async sendPushNotification(
    fcmToken: string | null | undefined,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<boolean> {
    if (!fcmToken || fcmToken.trim() === '') {
      return false;
    }

    if (!this.isInitialized) {
      this.logger.log(
        `[FCM Mock Push] To Token: ${fcmToken.substring(0, 10)}... | Title: "${title}" | Body: "${body}"`,
      );
      return false;
    }

    try {
      const message: Message = {
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'high_importance_channel',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              contentAvailable: true,
            },
          },
        },
      };

      const response = await getMessaging().send(message);
      this.logger.log(`✅ FCM Push Sent successfully! Message ID: ${response}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ FCM Push failed for token ${fcmToken}:`, error);
      return false;
    }
  }
}
