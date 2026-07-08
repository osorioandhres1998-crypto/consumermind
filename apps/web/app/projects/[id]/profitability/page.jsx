'use client';

import { useParams } from 'next/navigation';
import ProfitabilityTool from '../../../../components/tools/ProfitabilityTool';

export default function ProjectProfitabilityPage() {
  const { id } = useParams();
  return <ProfitabilityTool projectId={id} />;
}
