import { Notice } from "./notice";

export function AccessDenied({ what = "esta área" }: { what?: string }) {
  return (
    <div className="max-w-xl">
      <Notice tone="attention" title={`Seu perfil não dá acesso a ${what}.`}>
        Se precisar deste acesso, peça ao administrador do People OS para revisar seus papéis.
      </Notice>
    </div>
  );
}
