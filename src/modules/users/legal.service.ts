import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';

export const DEFAULT_PRIVACY_AR = `# سياسة الخصوصية لمنصة سبورجو (Spurgo)

مرحباً بك في منصة سبورجو. نحن نلتزم بحماية معلوماتك الشخصية وحقك في الخصوصية. توضح هذه السياسة كيفية جمع واستخدام وحماية ومشاركة بياناتك الشخصية عند استخدامك لتطبيق وموقع سبورجو.

### 1. المعلومات التي نجمعها
نقوم بجمع المعلومات الشخصية التي تقدمها لنا طواعية عند التسجيل أو استخدام خدمات المنصة:
- بيانات الحساب الشخصي: الاسم الكامل، عنوان البريد الإلكتروني، رقم الهاتف، وكلمة المرور المشفرة.
- بيانات التواصل المباشر: رقم هاتف واتساب (WhatsApp) لتسهيل التواصل وإتمام الصفقات.
- بيانات الموردين والمتاجر: اسم الشركة/المتجر، الرقم الضريبي (Tax ID)، وثائق السجل التجاري، التخصصات في قطع الغيار، وموقع المتجر الجغرافي.
- بيانات المعاملات والطلبات: تفاصيل طلبات قطع الغيار، ماركة وموديل وسنة المركبة، عروض الموردين، والأسعار.

### 2. كيف نستخدم معلوماتك
نستخدم المعلومات المجمعة للأغراض التشغيلية التالية:
- ربط ومطابقة طلبات العملاء مع عروض المتاجر والموردين المناسبين.
- إدارة ومتابعة رصيد نقاط المحفظة، عمليات الشحن، والاشتراكات.
- إرسال الإشعارات والتنبيهات المباشرة حول حالة الطلبات، العروض الجديدة، والرسائل الإدارية.
- مكافحة الاحتيال، التحقق من هوية الموردين، وضمان أمان المعاملات بين الأطراف.

### 3. مشاركة المعلومات مع الأطراف الأخرى
- منصة سبورجو هي منصة وسيطة لربط العملاء بموردي قطع الغيار؛ وبناءً على ذلك، عند قبول العرض أو مطابقة الطلب، يتم تبادل بيانات التواصل الضرورية (مثل رقم الهاتف ورابط واتساب) بين الطرفين لتسهيل استلام القطعة وإتمام الصفقة.
- نحن لا نقوم ببيع أو تأجير بياناتك الشخصية لأي شركات تسويق أو أطراف ثالثة خارجية تحت أي ظرف.

### 4. أمان وحماية البيانات
نحن نطبق أعلى معايير الأمان التقنية والتنظيمية لحماية بياناتك من الوصول غير المصرح به أو التعديل أو التسريب، بما في ذلك التشفير وتأمين الاتصالات عبر بروتوكولات SSL/TLS.

### 5. حقوق المستخدم وحذف الحساب
يحق لك في أي وقت:
- الاطلاع على بياناتك وتعديلها من خلال الملف الشخصي.
- طلب حذف حسابك نهائياً وجميع البيانات المرتبطة به عبر إعدادات التطبيق أو عبر التواصل مع فريق الدعم الفني.

### 6. التواصل معنا
إذا كانت لديك أية استفسارات أو ملاحظات بخصوص سياسة الخصوصية، يرجى التواصل مع فريق الدعم عبر البريد الإلكتروني أو الدعم المباشر داخل التطبيق.`;

export const DEFAULT_PRIVACY_EN = `# Spurgo Privacy Policy

Welcome to Spurgo. We are committed to protecting your personal information and respecting your privacy rights. This Privacy Policy outlines how we collect, use, protect, and handle your data when using the Spurgo mobile app and platform.

### 1. Information We Collect
We collect personal information that you provide voluntarily when registering or interacting with our services:
- Account Data: Full name, email address, phone number, and encrypted password.
- Direct Contact Information: WhatsApp phone number for transaction coordination and inquiries.
- Supplier & Store Details: Company/store name, tax registration number (Tax ID), commercial documents, parts specializations, and physical location.
- Requests & Listings: Vehicle brand, model, year, accessory descriptions, parts photos, supplier offers, and pricing.

### 2. How We Use Your Information
We use the collected information for the following core operations:
- Matching customer accessory requests with relevant parts suppliers and stores.
- Managing wallet credit points, transactions, and subscription plans.
- Dispatching real-time notifications regarding offer updates, match statuses, and platform announcements.
- Ensuring platform integrity, verifying supplier authenticity, and preventing fraudulent activities.

### 3. Sharing of Information
- Spurgo acts as a matching marketplace. Once a customer request matches an offer, direct contact details (phone and WhatsApp) are securely shared between the customer and the supplier to finalize the purchase.
- We do NOT sell, rent, or trade your personal data to third-party marketers or advertisers under any circumstances.

### 4. Data Security
We implement strict industry-standard security measures, including end-to-end encryption and secure SSL/TLS transmission, to protect your personal information against unauthorized access, alteration, or disclosure.

### 5. Your Rights & Account Deletion
You retain complete control over your personal data. In compliance with mobile app store policies, you can request account deletion at any time directly through the app settings or by contacting our support team. Upon deletion, your profile, contact links, and listings are permanently removed.

### 6. Contact Us
For any questions, clarifications, or requests regarding this Privacy Policy, please contact our support team via email or in-app support channels.`;

export const DEFAULT_TERMS_AR = `# شروط الاستخدام والخدمة لمنصة سبورجو (Spurgo)

تحدد هذه الاتفاقية الشروط والأحكام التي تحكم استخدامك لمنصة وتطبيق سبورجو لقطع غيار وإكسسوارات السيارات. باستخدامك للتطبيق أو تسجيل حساب، فإنك توافق على الالتزام الكامل بهذه الشروط.

### 1. طبيعة المنصة ودور سبورجو
منصة سبورجو هي سوق رقمي ومنصة وساطة إلكترونية تهدف إلى ربط العملاء الباحثين عن قطع غيار السيارات مع الموردين والمتاجر المتخصصة. سبورجو لا تمتلك مخزون قطع الغيار ولا تعد طرفاً مباشراً في عقد البيع أو فحص جودة القطع ما لم يُنص على خلاف ذلك صراحة.

### 2. حسابات المستخدمين والتحقق
- يجب أن تكون جميع البيانات المدخلة (الاسم، الهاتف، المدينة) صحيحة ودقيقة.
- يخضع حساب المورد للمراجعة والتدقيق والاعتماد من قبل إدارة سبورجو قبل السماح له بنشر العروض أو التواصل مع العملاء.
- يتحمل كل مستخدم كامل المسؤولية عن سرية حسابه وبيانات تسجيل الدخول الخاصة به.

### 3. إرشادات الطلبات والعروض
- يلتزم العملاء بتقديم وصف دقيق لقطع الغيار المطلوبة، مع تحديد نوع وموديل وسنة المركبة بدقة.
- يلتزم الموردون بتقديم أسعار حقيقية بالدينار الليبي (د.ل)، وتحديد حالة القطعة (جديدة / مستعملة)، ومواعيد التوصيل والضمان بصدق ودقة.
- يُحظر نشر أي إعلانات مضللة، قطع مقلدة دون توضيح، أو محتوى يخالف القوانين المعمول بها.

### 4. نظام النقاط والاشتراكات والمدفوعات
- يتم استخدام النقاط داخل المنصة لإرسال العروض أو إظهار بيانات التواصل المباشر للمتاجر.
- تخضع خطط الاشتراكات والبحث (العادي والذكي) للأسعار والمدد المحددة في جدول الباقات بالدينار الليبي (د.ل).
- الرسوم المدفوعة مقابل فتح بيانات التواصل أو تفعيل الباقات غير قابلة للاسترداد بعد تقديم الخدمة، إلا في حال ثبوت خطأ تقني معتمد من الإدارة.

### 5. فض النزاعات وحظر الحسابات
- تحتفظ إدارة المنصة بحق إيقاف أو حظر أي حساب يخالف شروط الاستخدام، أو يتلقى بلاغات متكررة من المستخدمين حول سوء المعاملة أو عدم الالتزام بالأسعار المعلنة.
- في حال نشوء أي خلاف بين العميل والمورد، تسعى سبورجو للمساعدة في التوفيق بين الطرفين دون تحمل أي التزام مالي أو قانوني ناتج عن المعاملة.

### 6. تعديل الشروط
تحتفظ سبورجو بحق تعديل أو تحديث هذه الشروط في أي وقت. يتم إشعار المستخدمين بالتحديثات الجوهرية عبر التطبيق أو الإشعارات الإدارية، ويُعتبر استمرار استخدامك للمنصة موافقة على الشروط المحدثة.`;

export const DEFAULT_TERMS_EN = `# Spurgo Terms of Service

These Terms of Service govern your access to and use of the Spurgo platform, mobile application, and related automotive parts matching services. By creating an account or using Spurgo, you agree to be bound by these Terms.

### 1. Platform Purpose & Scope
Spurgo is a digital intermediary marketplace designed to connect vehicle owners seeking auto parts and accessories with certified stores, suppliers, and distributors. Spurgo does not own the inventory and is not directly a party to transactions or physical part inspections unless explicitly stated.

### 2. Account Registration & Verification
- You must provide accurate, current, and complete information during registration.
- Supplier accounts undergo a strict administrative audit and document verification before receiving approval to submit proposals and contact buyers.
- Users are solely responsible for maintaining the confidentiality of their credentials and all activities occurring under their accounts.

### 3. Request & Offer Guidelines
- Customers must specify accurate vehicle details (make, model, year, VIN or part number) and clear accessory descriptions.
- Suppliers must quote genuine, binding prices in Libyan Dinars (LYD), accurately indicate the item condition (New/Used), delivery estimates, and warranty terms.
- Posting counterfeit items, misleading quotations, or duplicate spam listings is strictly prohibited and leads to immediate suspension.

### 4. Wallet Points, Plans & Payment Terms
- Wallet points are utilized to submit offers or unlock verified supplier direct contact details.
- Paid subscription packages and search tiers (Normal & Smart Search) operate based on the listed pricing in LYD.
- Fees paid for contact unlocks or subscriptions are non-refundable once the service has been rendered, except in cases of verified technical system failures.

### 5. Dispute Resolution & Account Sanctions
- Spurgo administrators reserve the right to suspend or terminate accounts that breach these terms, engage in deceptive trade practices, or accumulate valid user dispute flags.
- While Spurgo assists in mediating customer-supplier disputes, the platform assumes no financial liability for off-platform agreements or transit damages.

### 6. Amendments
Spurgo reserves the right to amend these Terms of Service at any time. Material updates will be announced via in-app alerts, and continued usage of the service constitutes agreement to the updated terms.`;

@Injectable()
export class LegalService implements OnModuleInit {
  private readonly logger = new Logger(LegalService.name);

  constructor(
    @InjectRepository(SystemConfig)
    private readonly configRepository: Repository<SystemConfig>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultLegal();
  }

  private async seedDefaultLegal(): Promise<void> {
    await this.ensureConfig('legal.privacy_policy.ar', DEFAULT_PRIVACY_AR);
    await this.ensureConfig('legal.privacy_policy.en', DEFAULT_PRIVACY_EN);
    await this.ensureConfig('legal.terms_of_service.ar', DEFAULT_TERMS_AR);
    await this.ensureConfig('legal.terms_of_service.en', DEFAULT_TERMS_EN);
    await this.ensureConfig('legal.privacy_policy.updatedAt', new Date().toISOString());
    await this.ensureConfig('legal.terms_of_service.updatedAt', new Date().toISOString());
  }

  private async ensureConfig(key: string, defaultValue: string): Promise<void> {
    try {
      const exists = await this.configRepository.findOne({ where: { key } });
      if (!exists) {
        await this.configRepository.save({ key, value: defaultValue });
      }
    } catch (e: any) {
      this.logger.error(`Error ensuring legal config for ${key}: ${e.message}`);
    }
  }

  async getPrivacyPolicy() {
    const ar = await this.configRepository.findOne({ where: { key: 'legal.privacy_policy.ar' } });
    const en = await this.configRepository.findOne({ where: { key: 'legal.privacy_policy.en' } });
    const updated = await this.configRepository.findOne({ where: { key: 'legal.privacy_policy.updatedAt' } });

    return {
      contentAr: ar?.value || DEFAULT_PRIVACY_AR,
      contentEn: en?.value || DEFAULT_PRIVACY_EN,
      updatedAt: updated?.value || new Date().toISOString(),
    };
  }

  async getTermsOfService() {
    const ar = await this.configRepository.findOne({ where: { key: 'legal.terms_of_service.ar' } });
    const en = await this.configRepository.findOne({ where: { key: 'legal.terms_of_service.en' } });
    const updated = await this.configRepository.findOne({ where: { key: 'legal.terms_of_service.updatedAt' } });

    return {
      contentAr: ar?.value || DEFAULT_TERMS_AR,
      contentEn: en?.value || DEFAULT_TERMS_EN,
      updatedAt: updated?.value || new Date().toISOString(),
    };
  }

  async getAllForAdmin() {
    const privacy = await this.getPrivacyPolicy();
    const terms = await this.getTermsOfService();

    return {
      privacyPolicyAr: privacy.contentAr,
      privacyPolicyEn: privacy.contentEn,
      privacyUpdatedAt: privacy.updatedAt,
      termsOfServiceAr: terms.contentAr,
      termsOfServiceEn: terms.contentEn,
      termsUpdatedAt: terms.updatedAt,
    };
  }

  async updateLegal(data: {
    privacyPolicyAr?: string;
    privacyPolicyEn?: string;
    termsOfServiceAr?: string;
    termsOfServiceEn?: string;
  }) {
    const now = new Date().toISOString();

    if (data.privacyPolicyAr !== undefined) {
      await this.configRepository.save({ key: 'legal.privacy_policy.ar', value: data.privacyPolicyAr });
      await this.configRepository.save({ key: 'legal.privacy_policy.updatedAt', value: now });
    }
    if (data.privacyPolicyEn !== undefined) {
      await this.configRepository.save({ key: 'legal.privacy_policy.en', value: data.privacyPolicyEn });
      await this.configRepository.save({ key: 'legal.privacy_policy.updatedAt', value: now });
    }
    if (data.termsOfServiceAr !== undefined) {
      await this.configRepository.save({ key: 'legal.terms_of_service.ar', value: data.termsOfServiceAr });
      await this.configRepository.save({ key: 'legal.terms_of_service.updatedAt', value: now });
    }
    if (data.termsOfServiceEn !== undefined) {
      await this.configRepository.save({ key: 'legal.terms_of_service.en', value: data.termsOfServiceEn });
      await this.configRepository.save({ key: 'legal.terms_of_service.updatedAt', value: now });
    }

    return {
      success: true,
      message: 'تم تحديث الشروط والسياسات بنجاح.',
      updatedAt: now,
    };
  }
}
