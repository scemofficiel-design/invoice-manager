/**
 * Modules métier, communs aux deux environnements :
 *  - l'application iPhone (frontend/src/local) les exécute dans le navigateur ;
 *  - le banc de test Node (app.ts) les expose via Fastify pour les tests d'intégration.
 * Aucun de ces modules ne dépend de Node.
 */
import { activityRoutes } from './modules/activities/routes';
import { catalogRoutes } from './modules/catalog/routes';
import { clientRoutes } from './modules/clients/routes';
import { clientDocumentRoutes } from './modules/client-documents/routes';
import { companyRoutes } from './modules/companies/routes';
import { currencyRoutes } from './modules/currencies/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { invoiceRoutes } from './modules/invoices/routes';
import { paymentRoutes } from './modules/payments/routes';
import { quoteRoutes } from './modules/quotes/routes';
import { searchRoutes } from './modules/search/routes';
import { taxRoutes } from './modules/taxes/routes';
import { pdfRoutes } from './pdf/routes';

export const businessRoutes = [
  companyRoutes,
  activityRoutes,
  taxRoutes,
  currencyRoutes,
  clientRoutes,
  clientDocumentRoutes,
  catalogRoutes,
  quoteRoutes,
  invoiceRoutes,
  paymentRoutes,
  pdfRoutes,
  dashboardRoutes,
  searchRoutes,
];
