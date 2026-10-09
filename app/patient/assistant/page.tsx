import { PageHeader } from '@/components/ui';
import { PatientAiAssistant } from '@/components/patient-ai-assistant';

export default function PatientAssistantPage() {
  return <>
    <PageHeader eyebrow="Patient Portal" title="CareMesh AI assistant" description="A private assistant for navigating your own CareMesh record, appointments and documents." />
    <PatientAiAssistant />
  </>;
}
