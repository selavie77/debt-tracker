import { DEBT_STATUSES, DEBT_TYPES, type Debt, type Entity } from "@/lib/db/schema";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/labels";

const dollars = (c: number | null | undefined) => (c == null ? "" : String(c / 100));

export function DebtFields({ entities, debt }: { entities: Entity[]; debt?: Debt }) {
  return (
    <>
      <label>Who owes it
        <select name="entityId" defaultValue={debt?.entityId ?? entities[0]?.id} required>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </label>
      <label>Name
        <input type="text" name="name" defaultValue={debt?.name} placeholder="HBJ Financial business loan" required />
      </label>
      <label>Creditor
        <input type="text" name="creditor" defaultValue={debt?.creditor} placeholder="HBJ Financial" />
      </label>
      <label>Type
        <select name="type" defaultValue={debt?.type ?? "other"}>
          {DEBT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </label>
      <label>Original balance ($)
        <input type="text" inputMode="decimal" name="original" defaultValue={dollars(debt?.originalCents)} placeholder="155,000" required />
      </label>
      <label>Interest rate (%)
        <input type="text" inputMode="decimal" name="rate" defaultValue={debt?.rateBps != null ? String(debt.rateBps / 100) : ""} placeholder="17" />
      </label>
      <label>Status
        <select name="status" defaultValue={debt?.status ?? "active"}>
          {DEBT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <label>Delinquent since
        <input type="date" name="delinquentSince" defaultValue={debt?.delinquentSince ?? ""} />
      </label>
      <label>Regular monthly payment ($)
        <input type="text" inputMode="decimal" name="monthly" defaultValue={dollars(debt?.monthlyPaymentCents)} placeholder="750" />
      </label>
      <label>Payment day of month (1 to 28)
        <input type="number" name="paymentDay" min={1} max={28} defaultValue={debt?.paymentDay ?? ""} />
      </label>
      <label>Collateral
        <input type="text" name="collateral" defaultValue={debt?.collateral} placeholder="Solar panels on home" />
      </label>
      <label className="check"><input type="checkbox" name="government" defaultChecked={debt?.government} /> Government-backed</label>
      <label className="check"><input type="checkbox" name="personalGuarantee" defaultChecked={debt?.personalGuarantee} /> Personal guarantee</label>
      <label className="wide">Notes
        <textarea name="notes" defaultValue={debt?.notes} />
      </label>
    </>
  );
}
