import Link from "next/link";
import { createDebt } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Empty, PageHead } from "@/components/Bits";
import { DebtFields } from "@/components/DebtFields";
import { withUser } from "@/lib/db";
import { listEntities } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewDebt() {
  const entities = await withUser((db) => listEntities(db));
  return (
    <>
      <Link className="back" href="/debts">&larr; All debts</Link>
      <PageHead title="Add a debt" sub="Settlement details and payments are added on the debt's page." />
      {entities.length === 0 ? (
        <Empty title="Add an entity first" text="Each debt belongs to a person or a company." href="/entities" cta="Add an entity" />
      ) : (
        <div className="panel">
          <ActionForm action={createDebt} submitLabel="Add debt">
            <DebtFields entities={entities} />
          </ActionForm>
        </div>
      )}
    </>
  );
}
