import Link from "next/link";
import { PLATFORM_NAME, COPYRIGHT_YEAR, CONTACT_EMAIL } from "../lib/config";

export const metadata = {
  title: `Privacy Policy — ${PLATFORM_NAME}`,
};

const EFFECTIVE_DATE = "February 21, 2026";

export default function PrivacyPolicyPage() {
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
        Privacy Policy
      </h1>
      <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 40 }}>
        {PLATFORM_NAME}™ · Effective {EFFECTIVE_DATE}
      </p>

      <Section title="1. Who we are">
        <p>
          {PLATFORM_NAME} is a staff development platform designed for restaurant and
          hospitality operators. We provide tools for employee check-ins, performance
          documentation, progressive discipline, 90-day onboarding milestones, and
          career progression tracking. References to &quot;we,&quot; &quot;our,&quot; or
          &quot;the platform&quot; mean {PLATFORM_NAME} and the operator company that
          has engaged us to manage their workforce data.
        </p>
      </Section>

      <Section title="2. What data we collect">
        <p>We collect the following categories of data:</p>
        <ul>
          <li><strong>Identity data:</strong> first name, last name, email address.</li>
          <li><strong>Employment data:</strong> hire date, position, department, station, location.</li>
          <li>
            <strong>Performance data:</strong> check-in notes, self-assessment scores,
            supervisor observations, flag reasons, follow-up commitments.
          </li>
          <li>
            <strong>Discipline records:</strong> verbal warnings, written warnings,
            separation warnings, commendations, and any written responses you submit
            to those records.
          </li>
          <li>
            <strong>Progression data:</strong> 90-day milestone completion records,
            assessment results, career progression plans.
          </li>
          <li>
            <strong>Account data:</strong> encrypted authentication credentials managed
            by Supabase Auth; we do not store plaintext passwords.
          </li>
          <li>
            <strong>Usage data:</strong> timestamps of logins and data submissions,
            collected for audit and security purposes.
          </li>
        </ul>
      </Section>

      <Section title="3. How we use your data">
        <p>Your data is used exclusively to:</p>
        <ul>
          <li>Operate and display the platform to you and your employer.</li>
          <li>Maintain your employment development record.</li>
          <li>Send you notifications related to your record (e.g., new entries, responses).</li>
          <li>Generate aggregate, anonymised analytics for your employer (e.g., team check-in completion rates).</li>
          <li>Meet our legal obligations for data security and breach notification.</li>
        </ul>
        <p>
          We do not sell, rent, or share your personal data with third parties for
          marketing purposes. We do not use your data to train AI or machine-learning
          models.
        </p>
      </Section>

      <Section title="4. Who can see your data">
        <p>
          Access is role-gated within the platform. Your employer controls who has
          access to your record:
        </p>
        <ul>
          <li>
            <strong>Staff (you):</strong> your own profile, shared check-in notes,
            your own discipline/commendation record, and your own right-of-reply responses.
          </li>
          <li>
            <strong>Supervisors (GM/Manager):</strong> staff records at their assigned location.
          </li>
          <li>
            <strong>Owners:</strong> all records across all locations within their company.
          </li>
        </ul>
        <p>
          {PLATFORM_NAME} personnel do not access individual employee records except
          when required for technical support, with explicit written authorisation from
          the operator.
        </p>
      </Section>

      <Section title="5. Data retention">
        <p>
          Discipline and performance records are retained for the duration of
          employment and for a period of no less than three (3) years following
          separation, in accordance with typical employment records legislation.
          Operators may request deletion of specific records in accordance with
          applicable law.
        </p>
        <p>
          The progressive discipline record resets for display purposes after
          365 days without a new infraction, but the underlying record is retained
          as a permanent audit trail.
        </p>
      </Section>

      <Section title="6. Your rights">
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul>
          <li>Access the personal data we hold about you.</li>
          <li>Request correction of inaccurate data.</li>
          <li>Request deletion of your data (subject to legal retention requirements).</li>
          <li>Object to or restrict certain processing activities.</li>
          <li>
            Submit a written response (right-of-reply) to any discipline entry
            on your record — this right is built into the platform.
          </li>
        </ul>
        <p>
          To exercise any of these rights, contact your employer&apos;s designated
          HR representative, or reach us directly at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#374151" }}>
            {CONTACT_EMAIL}
          </a>.
        </p>
      </Section>

      <Section title="7. Security">
        <p>
          Data is stored in a Supabase-managed PostgreSQL database with row-level
          security policies enforced at the database layer. All data is encrypted
          in transit (TLS 1.2+) and at rest. Authentication uses Supabase Auth
          with magic-link email verification.
        </p>
      </Section>

      <Section title="8. Changes to this policy">
        <p>
          We will notify operators of material changes to this policy by email
          at least 30 days before they take effect. Continued use of the platform
          after that date constitutes acceptance of the updated policy.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>
          Questions about this policy:{" "}
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
