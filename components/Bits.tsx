import Link from "next/link";
import type { DebtStatus } from "@/lib/db/schema";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/labels";

export function StatusChip({ status }: { status: DebtStatus }) {
  return <span className={`chip ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Kpi({ label, value, sub, hero }: { label: string; value: string; sub: string; hero?: boolean }) {
  return (
    <div className={`panel kpi${hero ? " hero" : ""}`}>
      <div className="v">{value}</div>
      <div className="l"><b>{label}</b><br />{sub}</div>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ title, text, href, cta }: { title: string; text: string; href?: string; cta?: string }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {text}
      {href && cta && (
        <p><Link className="btn" href={href}>{cta}</Link></p>
      )}
    </div>
  );
}
