import { exec } from 'child_process';
import { getAppCommand, AVAILABLE_APPS } from '../utils/apps';

export default defineEventHandler(async (event) => {
  // body에서 데이터 읽기 (JSON) 또는 쿼리 파라미터에서 읽기
  const body = await readBody(event).catch(() => ({}));
  const query = getQuery(event);
  const appName = ((body as any)?.app || (query.app as string) || 'chrome').toLowerCase();

  const command = getAppCommand(appName);

  if (!command) {
    return {
      success: false,
      error: `Application not found: ${appName}`,
      availableApps: AVAILABLE_APPS.map((a) => a.name),
    };
  }

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        resolve({
          success: false,
          error: error.message,
          app: appName,
        });
      } else {
        resolve({
          success: true,
          message: `${appName} opened successfully`,
          app: appName,
        });
      }
    });
  });
});
