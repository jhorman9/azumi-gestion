export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function formFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};

  formData.forEach((value, key) => {
    if (typeof value === "string") {
      fields[key] = value;
    }
  });

  return fields;
}
