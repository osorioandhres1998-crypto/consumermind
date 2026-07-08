'use client';

import { useParams } from 'next/navigation';
import LandingTool from '../../../../components/tools/LandingTool';

export default function ProjectLandingPage() {
  const { id } = useParams();
  return <LandingTool projectId={id} />;
}
