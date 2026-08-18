import { Modal } from "./Modal";
import Icon from "./Icon";
import { formatDateTime, formatMoney } from "../utils/format";

const STATUS_META = {
  active: { txt: "Aktiv", cls: "badge-ok" },
  partially_paid: { txt: "Qisman to'langan", cls: "badge-pay" },
  overdue: { txt: "Muddati o'tgan", cls: "badge-low" },
  paid: { txt: "✓ To'langan", cls: "badge-ok" },
  cancelled: { txt: "Bekor qilingan", cls: "badge-txn" },
};

function statusMeta(st) {
  return STATUS_META[st] || { txt: st || "—", cls: "badge-txn" };
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/**
 * Qarz tafsilotlari — to'lovlar tarixi bilan.
 *
 * @param {{ debt: object|null, open: boolean, onClose: () => void, onPay: (debt: object) => void }} props
 */
export function DebtDetailModal({ debt, open, onClose, onPay }) {
  const remaining = Number(debt?.remaining_amount || 0);
  const pct = Number(debt?.paid_percent || 0);

  return (
    <Modal open={open} onClose={onClose} size="lg">
      {debt && (
        <div>
          <div className="flex spread" style={{ marginBottom: 14 }}>
            <div>
              <h3>{debt.customer_name}</h3>
              <div className="sub mono">{debt.customer_phone}</div>
            </div>
            <span className={`badge ${statusMeta(debt.effective_status).cls}`}>
              {statusMeta(debt.effective_status).txt}
            </span>
          </div>

          <div className="grid-2">
            <div className="debt-info-row"><span>Boshlang'ich qarz</span><b className="mono">{formatMoney(debt.original_amount)}</b></div>
            <div className="debt-info-row"><span>Qolgan qarz</span><b className="mono" style={{ color: remaining > 0 ? "var(--danger)" : "var(--success)" }}>{formatMoney(remaining)}</b></div>
            <div className="debt-info-row"><span>To'langan</span><b className="mono">{formatMoney(debt.paid_amount)}</b></div>
            <div className="debt-info-row"><span>To'lash muddati</span><b className="mono">{fmtDate(debt.due_date)}</b></div>
            {debt.paid_at && (
              <div className="debt-info-row"><span>Yopilgan sana</span><b className="mono">{formatDateTime(debt.paid_at)}</b></div>
            )}
            {debt.paid_by_name && (
              <div className="debt-info-row"><span>Kassir</span><b>{debt.paid_by_name}</b></div>
            )}
          </div>

          <div className="debt-progress" style={{ "--pct": `${Math.min(pct, 100)}%`, margin: "14px 0 4px", maxWidth: "none" }}>
            <div className="debt-progress-fill" />
          </div>
          <div className="sub" style={{ marginBottom: 12 }}>
            To'langan: <b className="mono">{pct}%</b> · {formatMoney(debt.paid_amount)} / {formatMoney(debt.original_amount)}
          </div>

          {remaining > 0 && (
            <button className="btn btn-primary btn-block" style={{ marginBottom: 18 }} onClick={() => onPay(debt)}>
              <Icon name="money" /> To'lov qabul qilish
            </button>
          )}

          <h4 style={{ margin: "6px 0 10px" }}>To'lovlar tarixi</h4>
          {debt.payments && debt.payments.length > 0 ? (
            <div className="txn-list">
              {debt.payments.map((p) => (
                <div key={p.id} className="txn-row txn-pay">
                  <span className="badge badge-pay">{p.method_display}</span>
                  <span className="mono txn-note">{p.note || p.received_by_name || "To'lov"}</span>
                  <span className="mono txn-amount">{formatMoney(p.amount)}</span>
                  <span className="sub">{formatDateTime(p.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Hali to'lovlar yo'q</div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default DebtDetailModal;