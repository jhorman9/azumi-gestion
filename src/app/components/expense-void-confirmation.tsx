"use client";

import { useEffect, useId, useRef, useState } from "react";

export function ExpenseVoidConfirmation({
  actionUrl,
}: {
  actionUrl: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const titleId = `void-expense-title-${id}`;
  const descriptionId = `void-expense-description-${id}`;

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
        Anular gasto
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
            <h2 id={titleId}>¿Anular este gasto?</h2>
          </div>
        </div>
        <p id={descriptionId}>
          El gasto quedará anulado y dejará de descontarse del cierre. Esta
          acción no se puede deshacer.
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
