// GET /api/reports/2-fermer?farm_id=<uuid>&year=2026[&month=1]
// Authorization: Bearer <access_token пользователя Supabase> (или ?access_token= для ссылок на скачивание)
import { xlsxReport } from '../_lib/report-handler';

export const GET = xlsxReport('2-fermer');
