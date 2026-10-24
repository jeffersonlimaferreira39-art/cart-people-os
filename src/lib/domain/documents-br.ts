/** Validação de documentos brasileiros (apenas dígitos verificadores). */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidPis(value: string): boolean {
  const pis = onlyDigits(value);
  if (pis.length !== 11 || /^(\d)\1{10}$/.test(pis)) return false;
  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((s, w, i) => s + w * Number(pis[i]), 0);
  const rest = 11 - (sum % 11);
  const check = rest === 10 || rest === 11 ? 0 : rest;
  return check === Number(pis[10]);
}

/** Exibe CPF mascarado: ***.456.789-** */
export function maskCpf(value: string | null | undefined): string {
  const cpf = onlyDigits(value ?? "");
  if (cpf.length !== 11) return "—";
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

export function formatCpf(value: string | null | undefined): string {
  const cpf = onlyDigits(value ?? "");
  if (cpf.length !== 11) return "—";
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}
