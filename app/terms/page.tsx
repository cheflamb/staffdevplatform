import Link from "next/link";
import { PLATFORM_NAME, COPYRIGHT_YEAR, CONTACT_EMAIL } from "../lib/config";

export const metadata = {
  title: `Terms of Service — ${PLATFORM_NAME}`,
};

const EFFECTIVE_DATE = "February 21, 2026";

export default function TermsOfServicePage() {
  return (
    <main
      style={{
        padding: "48px 24px",
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.7,
        color: "#374151",
      }}
    >
      <Link href="/" style={{ fontSize: 14, color: "#6b7280", textDecoration: "none" }}>
        ← Back
      </Link>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 24, marginBottom: 6 }}>
        Terms of Service
      </h1>
      <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 40 }}>
        {PLATFORM_NAME}™ · Effective {EFFECTIVE_DATE}
      </p>

      <Section title="1. Acceptance">
        <p>
          By accessing or using {PLATFORM_NAME} (the &quot;Platform&quot;), you agree
          to be bound by these Terms of Service. If you are accessing the Platform on
          behalf of an employer (an &quot;Operator&quot;), you represent that you have
          authority to bind that organisation to these terms.
        </p>
        <p>
          If you do not agree to these terms, do not use the Platform.
        </p>
      </Section>

      <Section title="2. The Platform">
        <p>
          {PLATFORM_NAME} provides a staff development and HR documentation platform
          for restaurant and hospitality operators. Features include employee check-ins,
          performance reviews, progressive discipline records, 90-day onboarding
          milestones, career progression tracking, and team analytics.
        </p>
        <p>
          The Platform is a tool to support — not replace — human judgement in
          employment decisions. All documentation created through the Platform remains
          the responsibility of the Operator and the supervising party who created it.
        </p>
      </Section>

      <Section title="3. Operator responsibilities">
        <p>Operators who subscribe to {PLATFORM_NAME} agree to:</p>
        <ul>
          <li>
            Use the Platform in compliance with all applicable employment, labour,
            and privacy laws in their jurisdiction.
          </li>
          <li>
            Ensure that discipline records, check-in notes, and other documentation
            entered into the Platform are accurate, fair, and created in good faith.
          </li>
          <li>
            Provide staff members with access to their own records as contemplated
            by the Platform&apos;s design and any applicable right-of-access laws.
          </li>
          <li>
            Not use the Platform to document protected class characteristics, retaliatory
            actions, or any conduct that would be unlawful under applicable law.
          </li>
          <li>
            Maintain the confidentiality of account credentials and promptly notify us
            of any suspected breach.
          </li>
        </ul>
      </Section>

      <Section title="4. Staff member rights within the Platform">
        <p>
          Staff members whose employers use the Platform have the right to:
        </p>
        <ul>
          <li>View their own profile, shared check-in notes, and discipline/commendation record.</li>
          <li>
            Submit a written right-of-reply to any discipline entry on their record.
            This response is a permanent, uneditable part of their record once submitted.
          </li>
          <li>Request a copy of their record from their employer.</li>
        </ul>
        <p>
          {PLATFORM_NAME} does not adjudicate employment disputes. Disputes regarding
          the content of records must be resolved between the staff member and their
          employer, with appropriate legal counsel if needed.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>Access accounts or records you are not authorised to view.</li>
          <li>Attempt to circumvent role-based access controls.</li>
          <li>Input false, defamatory, or discriminatory content into the Platform.</li>
          <li>Reverse engineer, scrape, or extract data from the Platform programmatically.</li>
          <li>Use the Platform for any purpose that violates applicable law.</li>
        </ul>
      </Section>

      <Section title="6. Intellectual property">
        <p>
          The Platform, its design, code, and content are the intellectual property of{" "}
          {PLATFORM_NAME}™. All rights reserved. The ™ mark is claimed as an
          unregistered trademark. You may not copy, reproduce, or create derivative
          works from the Platform without express written permission.
        </p>
        <p>
          Data you enter into the Platform (employee records, check-in notes,
          assessment results) remains the property of the Operator. We do not
          claim ownership of your data.
        </p>
      </Section>

      <Section title="7. Data and privacy">
        <p>
          Our collection and use of personal data is governed by our{" "}
          <Link href="/privacy" style={{ color: "#374151" }}>Privacy Policy</Link>,
          which forms part of these Terms. By using the Platform, you consent to
          data practices described therein.
        </p>
      </Section>

      <Section title="8. Limitation of liability">
        <p>
          To the fullest extent permitted by applicable law, {PLATFORM_NAME} shall
          not be liable for any indirect, incidental, or consequential damages arising
          from use of the Platform, including but not limited to employment decisions
          made in reliance on records stored within it.
        </p>
        <p>
          Our aggregate liability for any claim arising from these Terms shall not
          exceed the fees paid by the Operator in the three months preceding the claim.
        </p>
      </Section>

      <Section title="9. Changes to these terms">
        <p>
          We may update these Terms from time to time. Material changes will be
          communicated to Operators at least 30 days in advance by email. Continued
          use of the Platform after the effective date of updated terms constitutes
          acceptance.
        </p>
      </Section>

      <Section title="10. Governing law">
        <p>
          These Terms are governed by the laws of the jurisdiction in which the
          Operator is incorporated or primarily operates, without regard to conflict
          of law provisions. Any disputes shall be resolved through binding arbitration
          unless prohibited by applicable law.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          Questions about these Terms:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#374151" }}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </Section>

      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 48 }}>
        © {COPYRIGHT_YEAR} {PLATFORM_NAME}™. All rights reserved.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: "#111827" }}>
        {title}
      </h2>
      <div style={{ fontSize: 15 }}>{children}</div>
    </section>
  );
}
