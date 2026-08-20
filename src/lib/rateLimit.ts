import { prisma } from "@/lib/prisma";

const DAILY_OCR_LIMIT = 20;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ponytail: single shared counter, no per-user/IP breakdown since there's no auth.
export async function consumeDailyOcrQuota(): Promise<{ allowed: boolean; remaining: number }> {
  const day = todayUtc();

  const usage = await prisma.ocrUsage.upsert({
    where: { day },
    create: { day, count: 1 },
    update: { count: { increment: 1 } },
  });

  return { allowed: usage.count <= DAILY_OCR_LIMIT, remaining: Math.max(0, DAILY_OCR_LIMIT - usage.count) };
}

export { DAILY_OCR_LIMIT };
