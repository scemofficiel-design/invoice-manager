import type { FastifyInstance, FastifyReply } from 'fastify';
import { companyAccess } from '../middleware/auth';
import { invoicePdf, quotePdf, receiptPdf } from './service';

function send(reply: FastifyReply, pdf: { buffer: Uint8Array; filename: string; archived?: boolean }, download: boolean) {
  return reply
    .header('content-type', 'application/pdf')
    .header('content-disposition', `${download ? 'attachment' : 'inline'}; filename="${pdf.filename}"`)
    .header('x-archived', pdf.archived ? '1' : '0')
    .header('cache-control', 'no-store')
    .send(pdf.buffer);
}

export async function pdfRoutes(app: FastifyInstance) {
  const { conn } = app;
  const dl = (q: unknown) => (q as { download?: string }).download === '1';
  const idOf = (p: unknown) => (p as { id: string }).id;
  app.get('/companies/:companyId/quotes/:id/pdf', { preHandler: companyAccess('viewer') }, async (req, reply) =>
    send(reply, await quotePdf(conn, req.company!.id, idOf(req.params)), dl(req.query)),
  );
  app.get('/companies/:companyId/invoices/:id/pdf', { preHandler: companyAccess('viewer') }, async (req, reply) =>
    send(reply, await invoicePdf(conn, req.company!.id, idOf(req.params)), dl(req.query)),
  );
  app.get('/companies/:companyId/receipts/:id/pdf', { preHandler: companyAccess('viewer') }, async (req, reply) =>
    send(reply, await receiptPdf(conn, req.company!.id, idOf(req.params)), dl(req.query)),
  );
}
