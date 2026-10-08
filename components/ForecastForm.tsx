import { addForecast } from "@/app/expect-actions";
import type { Entity } from "@/lib/db/schema";
import { ActionForm } from "./ActionForm";
import { ConfidenceField } from "./ConfidenceField";

/** Add a business income forecast: a monthly amount, how sure you are, which business, and for how long. */
export function ForecastForm({ entities, defaultMonth }: { entities: Entity[]; defaultMonth: string }) {
  const businesses = entities.filter((e) => e.kind === "business");
  const others = entities.filter((e) => e.kind !== "business");
  return (
    <ActionForm action={addForecast} submitLabel="Add forecast" resetOnSuccess>
      <label>What
        <input type="text" id="fc-name" name="name" placeholder="Side business" required />
      </label>
      <label>Which business
        <select id="fc-entity" name="entityId" defaultValue={businesses[0]?.id ?? ""}>
          <option value="">Not linked to one</option>
          {businesses.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          {others.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </label>
      <label>Per month, if things go well ($)
        <input type="text" id="fc-amount" name="amount" inputMode="decimal" placeholder="10,000" required />
      </label>
      <label>First month
        <input type="month" id="fc-start" name="start" defaultValue={defaultMonth} required />
      </label>
      <label>For how long
        <select id="fc-duration" name="duration" defaultValue="6">
          <option value="3">3 months</option>
          <option value="6">6 months</option>
          <option value="12">1 year</option>
          <option value="24">2 years</option>
          <option value="36">3 years</option>
          <option value="ongoing">No end date</option>
        </select>
      </label>
      <ConfidenceField idPrefix="fc" defaultValue={60} hint="The plan counts the amount times this. 60 means it counts $6,000 of a $10,000 month." />
      <p className="note wide" style={{ margin: 0 }}>
        Enter what you can actually use: after business costs and money set aside for taxes. Revenue is not take-home.
      </p>
    </ActionForm>
  );
}
