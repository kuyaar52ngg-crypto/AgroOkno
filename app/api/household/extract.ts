// GET /api/household/extract?farm_id=<uuid>  — PDF выписки из похозяйственной книги (учебный документ).
// Authorization: Bearer <access_token> или ?access_token=…
import { bearerToken, guard, loadFarmData, parseFarmId, todayInYakutsk, userClient } from '../_lib/context';
import { buildExtractPdf } from '../_lib/documents';
import { pdfResponse } from '../_lib/pdf';

export const GET = (request: Request) =>
  guard(async () => {
    const farmId = parseFarmId(new URL(request.url));
    const supabase = userClient(bearerToken(request));
    const data = await loadFarmData(supabase, farmId);
    const today = todayInYakutsk();
    return pdfResponse(await buildExtractPdf(data, today), `vypiska-${today}.pdf`);
  });
