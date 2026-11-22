"use client";

import { useEffect, useRef, useState } from "react";

interface BillVoidConfirmationProps {
  actionUrl: string;
  billId: string;
}

export function BillVoidConfirmation({
  actionUrl,
  billId,
}: BillVoidConfirmationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `void-bill-title-${billId}`;
  const descriptionId = `void-bill-description-${billId}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <>
      <button
        className="button-danger-outline"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        Anular factura
      </button>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="void-confirmation-dialog"
        onClose={() => setIsOpen(false)}
        ref={dialogRef}
      >
        <div className="void-confirmation-dialog__heading">
          <span aria-hidden="true">!</span>
          <div>
            <p className="eyebrow">Confirmación requerida</p>
            <h2 id={titleId}>¿Anular esta factura?</h2>
          </div>
        </div>
        <p id={descriptionId}>
          La factura quedará anulada y no podrá recibir pagos. Esta acción no se
          puede deshacer.
        </p>
        <div className="void-confirmation-dialog__actions">
          <button
            className="button-secondary"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            Volver
          </button>
          <form action={actionUrl} method="post">
            <input name="action" type="hidden" value="void" />
            <button className="button-danger" type="submit">
              Confirmar anulación
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
