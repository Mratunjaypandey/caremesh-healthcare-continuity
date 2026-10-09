import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeCareGaps } from '@/lib/care-gaps';
import { calculateAge } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLORS = {
  navy: rgb(11 / 255, 31 / 255, 58 / 255),
  text: rgb(21 / 255, 36 / 255, 55 / 255),
  muted: rgb(89 / 255, 103 / 255, 122 / 255),
  light: rgb(235 / 255, 240 / 255, 246 / 255),
  teal: rgb(15 / 255, 163 / 255, 168 / 255),
  amber: rgb(197 / 255, 122 / 255, 28 / 255),
  red: rgb(184 / 255, 60 / 255, 76 / 255),
  green: rgb(19 / 255, 125 / 255, 93 / 255),
  white: rgb(1, 1, 1),
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 44,
  marginTop: 48,
  marginBottom: 48,
};

function safeText(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeFilename(value: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+|\.+$/g, '');
  return cleaned || 'patient';
}

function normalizeDate(value: unknown): string {
  if (!value) return '—';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T12:00:00`);
    return Number.isNaN(d.getTime())
      ? raw
      : d.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
  }
  return raw;
}

function reportContentToObject(content: unknown): Record<string, any> {
  if (!content) return {};
  if (typeof content === 'object') return content as Record<string, any>;
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

type PdfContext = {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument['addPage']>;
  regular: any;
  bold: any;
  y: number;
};

function decoratePage(ctx: PdfContext) {
  ctx.y = PAGE.height - PAGE.marginTop;

  ctx.page.drawLine({
    start: { x: PAGE.marginX, y: ctx.y + 14 },
    end: { x: PAGE.width - PAGE.marginX, y: ctx.y + 14 },
    thickness: 1,
    color: COLORS.light,
  });

  ctx.page.drawText('CareMesh', {
    x: PAGE.marginX,
    y: ctx.y + 20,
    size: 8,
    font: ctx.bold,
    color: COLORS.navy,
  });

  ctx.page.drawText('Healthcare Continuity Intelligence', {
    x: PAGE.width - PAGE.marginX - 150,
    y: ctx.y + 20,
    size: 7,
    font: ctx.regular,
    color: COLORS.muted,
  });
}

function addPage(ctx: PdfContext) {
  ctx.page = ctx.pdfDoc.addPage([PAGE.width, PAGE.height]);
  decoratePage(ctx);
}

function ensureSpace(ctx: PdfContext, requiredHeight: number) {
  if (ctx.y - requiredHeight < PAGE.marginBottom) {
    addPage(ctx);
  }
}

function splitText(
  text: string,
  font: any,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      // Extremely long token: chunk it by characters.
      let chunk = '';
      for (const char of word) {
        const next = `${chunk}${char}`;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          chunk = next;
        } else {
          if (chunk) lines.push(chunk);
          chunk = char;
        }
      }
      current = chunk;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function drawWrapped(
  ctx: PdfContext,
  text: string,
  options: {
    size?: number;
    color?: any;
    font?: any;
    lineGap?: number;
    indent?: number;
    bullet?: boolean;
  } = {},
) {
  const size = options.size ?? 9;
  const color = options.color ?? COLORS.text;
  const font = options.font ?? ctx.regular;
  const lineGap = options.lineGap ?? 3;
  const indent = options.indent ?? 0;
  const bulletPrefix = options.bullet ? '• ' : '';
  const width = PAGE.width - PAGE.marginX * 2 - indent;
  const availableWidth = width - (options.bullet ? 12 : 0);
  const lines = splitText(text, font, size, availableWidth);

  for (let i = 0; i < lines.length; i += 1) {
    ensureSpace(ctx, size + lineGap + 4);

    const prefix = i === 0 ? bulletPrefix : options.bullet ? '  ' : '';
    ctx.page.drawText(`${prefix}${lines[i]}`, {
      x: PAGE.marginX + indent,
      y: ctx.y,
      size,
      font,
      color,
    });

    ctx.y -= size + lineGap;
  }
}

function drawSectionTitle(ctx: PdfContext, title: string) {
  ensureSpace(ctx, 32);
  ctx.y -= 10;

  ctx.page.drawText(title, {
    x: PAGE.marginX,
    y: ctx.y,
    size: 12,
    font: ctx.bold,
    color: COLORS.navy,
  });

  ctx.y -= 7;

  ctx.page.drawLine({
    start: { x: PAGE.marginX, y: ctx.y },
    end: { x: PAGE.width - PAGE.marginX, y: ctx.y },
    thickness: 0.8,
    color: COLORS.light,
  });

  ctx.y -= 12;
}

function drawLabelValue(
  ctx: PdfContext,
  label: string,
  value: string,
) {
  ensureSpace(ctx, 18);

  ctx.page.drawText(`${label}:`, {
    x: PAGE.marginX,
    y: ctx.y,
    size: 8,
    font: ctx.bold,
    color: COLORS.text,
  });

  const labelWidth = ctx.bold.widthOfTextAtSize(`${label}:`, 8);

  ctx.page.drawText(value, {
    x: PAGE.marginX + labelWidth + 5,
    y: ctx.y,
    size: 8,
    font: ctx.regular,
    color: COLORS.muted,
  });

  ctx.y -= 13;
}

function drawEventCard(ctx: PdfContext, event: any) {
  const title = `${normalizeDate(event.event_date)} · ${safeText(event.event_type).replaceAll('_', ' ')} · ${safeText(event.title, 'Care event')}`;
  const meta = `${safeText(event.department, 'CareMesh')} · ${safeText(event.clinician)} · Source: ${safeText(event.source_label, 'CareMesh')}`;
  const summary = event.summary ? safeText(event.summary) : '';

  // Conservative estimate; ensureSpace will paginate if needed.
  ensureSpace(ctx, 82);

  const boxTop = ctx.y + 7;
  const boxX = PAGE.marginX - 4;
  const boxW = PAGE.width - PAGE.marginX * 2 + 8;

  ctx.page.drawRectangle({
    x: boxX,
    y: ctx.y - 54,
    width: boxW,
    height: 66,
    color: COLORS.white,
    borderColor: COLORS.light,
    borderWidth: 0.8,
  });

  ctx.page.drawRectangle({
    x: boxX,
    y: ctx.y - 54,
    width: 3,
    height: 66,
    color: COLORS.teal,
  });

  ctx.page.drawText(title, {
    x: PAGE.marginX + 10,
    y: ctx.y,
    size: 8.5,
    font: ctx.bold,
    color: COLORS.text,
    maxWidth: boxW - 22,
  });

  ctx.y -= 13;

  drawWrapped(ctx, meta, {
    size: 7.5,
    color: COLORS.muted,
    indent: 10,
    lineGap: 2,
  });

  if (summary) {
    drawWrapped(ctx, summary, {
      size: 8,
      color: COLORS.text,
      indent: 10,
      lineGap: 2,
    });
  }

  if (event.prescription) {
    drawWrapped(ctx, `Documented instruction: ${safeText(event.prescription)}`, {
      size: 7.7,
      color: COLORS.muted,
      indent: 10,
      lineGap: 2,
    });
  }

  ctx.y -= 6;

  // Keep TS/linters from treating boxTop as accidental dead logic if changed later.
  void boxTop;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // ---------------------------------------------------------
    // Authentication
    // ---------------------------------------------------------
    const user = await getSessionUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return new Response('Missing patient id', { status: 400 });
    }

    // ---------------------------------------------------------
    // Server-side admin client.
    // Authorization is checked BEFORE data is exposed.
    // ---------------------------------------------------------
    const supabase = createAdminClient();

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (patientError) {
      console.error('Report patient query failed:', patientError);
      return new Response(`Patient lookup failed: ${patientError.message}`, {
        status: 500,
      });
    }

    if (!patient) {
      return new Response('Not found', { status: 404 });
    }

    // Organization boundary.
    if (patient.org_id !== user.orgId) {
      return new Response('Not found', { status: 404 });
    }

    // Patient boundary.
    if (user.role === 'PATIENT') {
      const linkedPatientId = (user as any).patientId;

      if (!linkedPatientId || linkedPatientId !== patient.id) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    // ---------------------------------------------------------
    // Load report data.
    // ---------------------------------------------------------
    const [eventsResult, appointmentsResult, documentsResult, reportResult] =
      await Promise.all([
        supabase
          .from('care_events')
          .select('*')
          .eq('patient_id', id)
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true }),

        supabase
          .from('appointments')
          .select('*')
          .eq('patient_id', id)
          .order('appointment_date', { ascending: true })
          .order('appointment_time', { ascending: true }),

        supabase
          .from('documents')
          .select(
            'id,file_name,document_type,status,linked_event_id,created_at',
          )
          .eq('patient_id', id)
          .order('created_at', { ascending: true }),

        supabase
          .from('reports')
          .select('content,created_at,model')
          .eq('patient_id', id)
          .eq('report_type', 'AI_HISTORY')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (eventsResult.error) {
      console.error('Care events query failed:', eventsResult.error);
      return new Response(
        `Care events query failed: ${eventsResult.error.message}`,
        { status: 500 },
      );
    }

    if (appointmentsResult.error) {
      console.error(
        'Appointments query failed:',
        appointmentsResult.error,
      );
      return new Response(
        `Appointments query failed: ${appointmentsResult.error.message}`,
        { status: 500 },
      );
    }

    if (documentsResult.error) {
      console.error('Documents query failed:', documentsResult.error);
      return new Response(
        `Documents query failed: ${documentsResult.error.message}`,
        { status: 500 },
      );
    }

    // Missing AI report must NOT break PDF generation.
    if (reportResult.error) {
      console.warn('Latest AI report unavailable:', reportResult.error);
    }

    const events = eventsResult.data ?? [];
    const appointments = appointmentsResult.data ?? [];
    const documents = documentsResult.data ?? [];

    const gaps = computeCareGaps(
      events as any,
      appointments as any,
      documents as any,
    );

    const latestReport = reportResult.data ?? null;
    const latestReportContent = reportContentToObject(
      latestReport?.content,
    );

    // ---------------------------------------------------------
    // Build PDF using pdf-lib.
    // This avoids PDFKit .afm/font-path problems in Next/Turbopack.
    // ---------------------------------------------------------
    const pdfDoc = await PDFDocument.create();

    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const ctx: PdfContext = {
      pdfDoc,
      page: pdfDoc.addPage([PAGE.width, PAGE.height]),
      regular,
      bold,
      y: PAGE.height - PAGE.marginTop,
    };

    decoratePage(ctx);

    // ---------------------------------------------------------
    // Premium cover / patient heading
    // ---------------------------------------------------------
    const coverX = PAGE.marginX;
    const coverW = PAGE.width - PAGE.marginX * 2;
    const coverTop = ctx.y + 4;
    const coverH = 78;

    ctx.page.drawRectangle({
      x: coverX,
      y: coverTop - coverH,
      width: coverW,
      height: coverH,
      color: COLORS.navy,
      opacity: 0.98,
    });

    ctx.page.drawRectangle({
      x: coverX,
      y: coverTop - coverH,
      width: coverW * 0.42,
      height: coverH,
      color: rgb(0.24, 0.43, 0.86),
      opacity: 0.38,
    });

    ctx.page.drawText('CareMesh', {
      x: coverX + 14,
      y: coverTop - 23,
      size: 18,
      font: bold,
      color: COLORS.white,
    });

    ctx.page.drawText('Healthcare Continuity History', {
      x: coverX + 14,
      y: coverTop - 38,
      size: 8.5,
      font: regular,
      color: rgb(0.80, 0.88, 0.96),
    });

    ctx.page.drawText(safeText(patient.full_name, 'Patient'), {
      x: coverX + 14,
      y: coverTop - 59,
      size: 13.5,
      font: bold,
      color: COLORS.white,
    });

    const coverMeta = `${safeText(patient.patient_code)} · ${calculateAge(patient.dob)} yrs · ${safeText(patient.gender)}`;
    ctx.page.drawText(coverMeta, {
      x: coverX + coverW - bold.widthOfTextAtSize(coverMeta, 7.5) - 14,
      y: coverTop - 59,
      size: 7.5,
      font: regular,
      color: rgb(0.80, 0.88, 0.96),
    });

    ctx.y = coverTop - coverH - 18;

    drawWrapped(
      ctx,
      `Mobile: ${safeText(patient.mobile)} · Generated: ${new Date().toLocaleString('en-IN')}`,
      { size: 7.8, color: COLORS.muted },
    );

    drawWrapped(
      ctx,
      `${safeText(patient.patient_code)} · ${calculateAge(patient.dob)} years · ${safeText(patient.gender)} · ${safeText(patient.mobile)}`,
      {
        size: 8.5,
        color: COLORS.muted,
      },
    );

    drawWrapped(
      ctx,
      `Generated: ${new Date().toLocaleString('en-IN')}`,
      {
        size: 7.5,
        color: COLORS.muted,
      },
    );

    drawSectionTitle(ctx, 'Patient profile');

    drawLabelValue(ctx, 'Patient ID', safeText(patient.patient_code));
    drawLabelValue(ctx, 'Date of birth', normalizeDate(patient.dob));
    drawLabelValue(ctx, 'Gender', safeText(patient.gender));
    drawLabelValue(ctx, 'Mobile', safeText(patient.mobile));
    drawLabelValue(ctx, 'Address', safeText(patient.address));
    drawLabelValue(
      ctx,
      'Emergency contact',
      safeText(patient.emergency_contact),
    );

    if (Object.keys(latestReportContent).length) {
      drawSectionTitle(ctx, 'AI-assisted care summary');

      drawWrapped(
        ctx,
        safeText(
          latestReportContent.overview,
          'An AI-assisted summary has been generated from documented CareMesh records.',
        ),
        {
          size: 8.5,
          color: COLORS.text,
          lineGap: 3,
        },
      );

      const highlights = Array.isArray(
        latestReportContent.timeline_highlights,
      )
        ? latestReportContent.timeline_highlights
        : [];

      if (highlights.length) {
        ctx.y -= 5;
        drawWrapped(ctx, 'Timeline highlights', {
          size: 9,
          font: bold,
          color: COLORS.navy,
        });

        for (const item of highlights.slice(0, 10)) {
          drawWrapped(
            ctx,
            `${safeText(item.date)} · ${safeText(item.title)} — ${safeText(item.summary)}`,
            {
              size: 8,
              color: COLORS.muted,
              bullet: true,
            },
          );

          const sources = Array.isArray(item.source_event_ids)
            ? item.source_event_ids
            : [];

          if (sources.length) {
            drawWrapped(
              ctx,
              `Sources: ${sources.join(', ')}`,
              {
                size: 7,
                color: COLORS.muted,
                indent: 12,
              },
            );
          }
        }
      }

      const actions = Array.isArray(
        latestReportContent.next_actions,
      )
        ? latestReportContent.next_actions
        : [];

      if (actions.length) {
        ctx.y -= 5;
        drawWrapped(ctx, 'Documented next actions', {
          size: 9,
          font: bold,
          color: COLORS.navy,
        });

        for (const action of actions.slice(0, 10)) {
          drawWrapped(ctx, safeText(action), {
            size: 8,
            color: COLORS.muted,
            bullet: true,
          });
        }
      }
    }

    // ---------------------------------------------------------
    // Timeline
    // ---------------------------------------------------------
    drawSectionTitle(ctx, 'Longitudinal timeline');

    if (!events.length) {
      drawWrapped(
        ctx,
        'No care events are currently recorded for this patient.',
        { size: 8.5, color: COLORS.muted },
      );
    } else {
      for (const event of events) {
        drawEventCard(ctx, event);
      }
    }

    // ---------------------------------------------------------
    // Appointments
    // ---------------------------------------------------------
    drawSectionTitle(ctx, 'Appointments');

    if (!appointments.length) {
      drawWrapped(
        ctx,
        'No appointments are currently recorded.',
        { size: 8.5, color: COLORS.muted },
      );
    } else {
      for (const appointment of appointments) {
        ensureSpace(ctx, 42);

        drawWrapped(
          ctx,
          `${normalizeDate(
            appointment.appointment_date,
          )} ${appointment.appointment_time ? String(appointment.appointment_time).slice(0, 5) : ''} · ${safeText(appointment.status)}`,
          {
            size: 8.5,
            font: bold,
            color: COLORS.text,
          },
        );

        drawWrapped(
          ctx,
          `${safeText(appointment.department)} · ${safeText(appointment.clinician)} · ${safeText(appointment.reason)}`,
          {
            size: 7.8,
            color: COLORS.muted,
          },
        );

        ctx.y -= 3;
      }
    }

    // ---------------------------------------------------------
    // Documents
    // ---------------------------------------------------------
    drawSectionTitle(ctx, 'Documents');

    if (!documents.length) {
      drawWrapped(
        ctx,
        'No documents are currently recorded.',
        { size: 8.5, color: COLORS.muted },
      );
    } else {
      for (const document of documents) {
        ensureSpace(ctx, 38);

        drawWrapped(
          ctx,
          safeText(document.file_name, 'Document'),
          {
            size: 8.5,
            font: bold,
            color: COLORS.text,
          },
        );

        drawWrapped(
          ctx,
          `${safeText(document.document_type)} · ${safeText(document.status)} · Created ${normalizeDate(document.created_at)}`,
          {
            size: 7.8,
            color: COLORS.muted,
          },
        );

        ctx.y -= 3;
      }
    }

    // ---------------------------------------------------------
    // Care gaps
    // ---------------------------------------------------------
    drawSectionTitle(ctx, 'Continuity care gaps');

    if (!gaps.length) {
      drawWrapped(
        ctx,
        'No unresolved continuity gaps were identified by the CareMesh rules at report generation time.',
        { size: 8.5, color: COLORS.green },
      );
    } else {
      for (const gap of gaps) {
        ensureSpace(ctx, 45);

        const severity = safeText(gap.severity).toUpperCase();
        const severityColor =
          severity === 'HIGH'
            ? COLORS.red
            : severity === 'MEDIUM'
              ? COLORS.amber
              : COLORS.muted;

        drawWrapped(
          ctx,
          `${severity} · ${safeText(gap.gapType)}`,
          {
            size: 8.5,
            font: bold,
            color: severityColor,
          },
        );

        drawWrapped(ctx, safeText(gap.description), {
          size: 7.8,
          color: COLORS.muted,
        });

        ctx.y -= 3;
      }
    }

    // ---------------------------------------------------------
    // Safety footer
    // ---------------------------------------------------------
    ensureSpace(ctx, 55);
    ctx.y -= 8;

    ctx.page.drawRectangle({
      x: PAGE.marginX,
      y: ctx.y - 33,
      width: PAGE.width - PAGE.marginX * 2,
      height: 42,
      color: rgb(1, 0.98, 0.92),
      borderColor: rgb(0.92, 0.84, 0.58),
      borderWidth: 0.7,
    });

    ctx.page.drawText('Safety boundary', {
      x: PAGE.marginX + 8,
      y: ctx.y - 3,
      size: 7.5,
      font: bold,
      color: COLORS.amber,
    });

    const footerText =
      'CareMesh organizes documented healthcare records and workflow continuity. It is not a diagnostic system and does not replace qualified clinical judgment.';

    const footerLines = splitText(
      footerText,
      regular,
      7,
      PAGE.width - PAGE.marginX * 2 - 24,
    );

    footerLines.slice(0, 3).forEach((line, index) => {
      ctx.page.drawText(line, {
        x: PAGE.marginX + 8,
        y: ctx.y - 14 - index * 9,
        size: 7,
        font: regular,
        color: COLORS.muted,
      });
    });

    // ---------------------------------------------------------
    // Page numbers
    // ---------------------------------------------------------
    const pages = pdfDoc.getPages();

    pages.forEach((page, index) => {
      page.drawText(
        `CareMesh · ${index + 1} / ${pages.length}`,
        {
          x: PAGE.width - PAGE.marginX - 80,
          y: 24,
          size: 7,
          font: regular,
          color: COLORS.muted,
        },
      );
    });

    const pdfBytes = await pdfDoc.save({
      useObjectStreams: true,
    });

    const fileName = `${safeFilename(
      safeText(patient.patient_code, `patient-${id}`),
    )}_caremesh_history.pdf`;

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('CareMesh report generation failed:', error);

    const message =
      error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      `Report generation failed: ${message}`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
