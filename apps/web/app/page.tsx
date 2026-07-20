'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';

export default function RootPage() {
  const { data, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (data) {
      router.replace(`/locations/${data.locationId}/queue`);
    } else {
      router.replace('/login');
    }
  }, [isLoading, data, router]);

  return null;
}
