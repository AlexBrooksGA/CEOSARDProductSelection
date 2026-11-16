import {test,expect} from '@playwright/test';
test('monitoring absence is not a service-health or quality verdict',async({page})=>{
 await page.goto('/monitoring');
 await expect(page.getByRole('heading',{name:'C-QAS monitoring',exact:true})).toBeVisible();
 await expect(page.getByText('No published series or alert snapshots available.')).toBeVisible();
 await expect(page.getByText('All services healthy',{exact:true})).toHaveCount(0);
});
