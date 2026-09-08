import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * PT26 — importa o Excel de exemplo (semana 2026-09-07) no back-office, publica a semana e
 * verifica que aparece no ecrã do pivot (/pt26/live) com os valores certos.
 *
 * Precisa de uma conta admin: PT26_E2E_EMAIL / PT26_E2E_PASSWORD (e da app a correr em
 * PT26_E2E_BASE_URL). Reimportar a mesma data substitui a semana e volta-a a rascunho, por isso o
 * teste é idempotente.
 */
const EMAIL = process.env.PT26_E2E_EMAIL;
const PASSWORD = process.env.PT26_E2E_PASSWORD;
const SAMPLE = path.resolve(__dirname, "../../samples/pt26/semana-2026-09-07.xlsx");
const DATE = "2026-09-07";

test.describe("PT26 tracking poll", () => {
  test.skip(!EMAIL || !PASSWORD, "PT26_E2E_EMAIL / PT26_E2E_PASSWORD não definidos");

  test("importa o Excel de exemplo, publica e aparece em /pt26/live", async ({ page }) => {
    // 1. login
    await page.goto("/login");
    await page.getByPlaceholder(/@/).fill(EMAIL!);
    await page.locator('input[type="password"]').fill(PASSWORD!);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));

    // 2. back-office → importar
    await page.goto("/admin/pt26");
    await expect(page.getByRole("heading", { name: "PT26 · Tracking poll" })).toBeVisible();
    await page.getByRole("button", { name: "Importar Excel" }).click();
    await page.locator('input[type="date"]').fill(DATE);
    await page.locator('input[type="file"]').setInputFiles(SAMPLE);
    await page.getByRole("button", { name: "Pré-visualizar" }).click();

    // 3. pré-visualização sem erros, com os valores lidos
    await expect(page.getByText("Sem erros")).toBeVisible();
    await expect(page.getByText("semana-2026-09-07.xlsx").first()).toBeVisible();
    await expect(page.getByText("27,9").first()).toBeVisible();
    await page.getByRole("button", { name: /Confirmar/ }).click();
    await expect(page.getByText(/gravada em rascunho/)).toBeVisible();

    // 4. publicar a semana (fecha o editor primeiro se estiver aberto)
    const closeEditor = page.getByRole("button", { name: "Fechar", exact: true });
    if (await closeEditor.isVisible()) await closeEditor.click();
    const row = page.locator("tr", { hasText: "semana-2026-09-07.xlsx" }).first();
    // depois do import a semana volta a rascunho — esperar pela lista atualizada
    await expect(row.getByText("Rascunho", { exact: true })).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(row.getByText("Publicada", { exact: true })).toBeVisible();

    // 5. token do ecrã (sessão admin) → ecrã do pivot
    const settings = await page.request.get("/api/pt26/admin/settings");
    expect(settings.ok()).toBeTruthy();
    const { settings: s } = (await settings.json()) as { settings: { live_token: string | null } };
    const key = s.live_token ?? "";

    await page.goto(`/pt26/live${key ? `?key=${encodeURIComponent(key)}` : ""}`);
    await expect(page.getByText("Escolha a semana")).toBeVisible();
    await page.getByRole("button", { name: /7 Set 2026/ }).click();
    await page.getByRole("button", { name: /Intenção de voto/ }).click();
    await expect(page.getByRole("heading", { name: "Intenção de voto" })).toBeVisible();
    // números contam até ao valor final (~0,8 s)
    await expect(page.locator(".cnt", { hasText: "27,9" })).toBeVisible();
    await expect(page.locator(".cnt", { hasText: "27,1" })).toBeVisible();
    await expect(page.locator(".cnt", { hasText: "25,7" })).toBeVisible();

    // quadros e histórico
    await page.getByRole("button", { name: /Restantes partidos/ }).click();
    await expect(page.getByText("O/B/N")).toBeVisible();
    await page.getByRole("button", { name: "Histórico" }).click();
    await expect(page.getByText(/Evolução até/)).toBeVisible();
  });

  test("o ecrã do pivot exige a chave quando há token", async ({ page, request }) => {
    const res = await request.get("/api/pt26/live");
    // Sem sessão nem chave: 403 quando há token configurado, 200 quando o ecrã está aberto.
    expect([200, 403]).toContain(res.status());
    if (res.status() === 403) {
      await page.goto("/pt26/live");
      await expect(page.getByText(/Ecrã reservado à emissão/)).toBeVisible();
    }
  });
});
