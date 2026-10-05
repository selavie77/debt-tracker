import { importCsv } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { PageHead } from "@/components/Bits";

const DEBT_EXAMPLE = `entity,name,creditor,type,original,rate,status,monthly,payment_day,collateral,government,personal_guarantee
Operating Co. LLC,SBA EIDL loan,SBA,government loan,150000,3.75,kept,750,20,Business assets,yes,yes`;
const PAY_EXAMPLE = `debt,date,amount,interest,note
SBA EIDL loan,2026-01-20,750,468,January`;

export default function ImportPage() {
  return (
    <>
      <PageHead title="Import" sub="Paste rows from a spreadsheet. The whole paste is checked first, so a mistake imports nothing." />
      <div className="panel">
        <h2>Debts</h2>
        <p className="note">Columns: entity, name, original are required. Others are optional. New entities are created from the entity column.</p>
        <ActionForm action={importCsv} submitLabel="Import debts">
          <input type="hidden" name="kind" value="debts" />
          <label className="wide">Paste CSV or tab-separated rows
            <textarea name="csv" style={{ minHeight: 120, fontFamily: "var(--f-num), monospace" }} defaultValue={DEBT_EXAMPLE} />
          </label>
        </ActionForm>
      </div>
      <div className="panel">
        <h2>Payments</h2>
        <p className="note">The debt column must match an existing debt name exactly. Import debts first.</p>
        <ActionForm action={importCsv} submitLabel="Import payments">
          <input type="hidden" name="kind" value="payments" />
          <label className="wide">Paste CSV or tab-separated rows
            <textarea name="csv" style={{ minHeight: 120, fontFamily: "var(--f-num), monospace" }} defaultValue={PAY_EXAMPLE} />
          </label>
        </ActionForm>
      </div>
    </>
  );
}
