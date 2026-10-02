import { z } from 'zod';

const EntrySchema = z
  .object({
    client: z.object({ email: z.string().trim().min(1).max(128) }).passthrough(),
    inboundIds: z
      .array(z.number().int().positive())
      .nullish()
      .transform((value) => value ?? []),
  })
  .passthrough();
const BackupSchema = z.array(EntrySchema).min(1).max(10000);
export const CLIENT_BACKUP_MAX_BYTES = 10 * 1024 * 1024;
export function parseClientBackup(text: string) {
  if (new Blob([text]).size > CLIENT_BACKUP_MAX_BYTES) throw new Error('备份文件不能超过 10 MB');
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('JSON 格式不正确，请选择用户配置导出的文件');
  }
  const result = BackupSchema.safeParse(data);
  if (!result.success)
    throw new Error('备份需要包含 1–10000 条用户配置，每条包含 client.email 和有效的 inboundIds');
  return result.data;
}
export type ClientImportResult = { created: number; skipped?: { email: string; reason: string }[] };
