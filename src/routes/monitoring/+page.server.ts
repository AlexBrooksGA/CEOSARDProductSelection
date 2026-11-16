import { bundledData } from '$lib/server/catalogue';
export const load = () => {
 const result = bundledData();
 return 'data' in result ? {series: Object.values(result.data.cqasSeries).flat(), alerts: result.data.cqasAlerts, warnings: result.data.cqasWarnings} : {series: [], alerts: [], warnings: ['Monitoring evidence could not be loaded.']};
};
