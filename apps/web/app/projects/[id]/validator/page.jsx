'use client';

import { useParams } from 'next/navigation';
import ValidatorTool from '../../../../components/tools/ValidatorTool';

export default function ProjectValidatorPage() {
  const { id } = useParams();
  return <ValidatorTool projectId={id} />;
}
