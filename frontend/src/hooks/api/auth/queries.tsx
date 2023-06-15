import { useMutation, useQuery } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';
import { setAuthToken } from '@app/reactQuery';

// import terminusToken from '@app/pages/api/auth/CheckTerminusToken';
import {
  GetAuthTokenAPI,
  SendMfaTokenDTO,
  VerifyMfaTokenDTO,
  VerifyMfaTokenRes} from './types';

const authKeys = {
  getAuthToken: ['token'] as const
};

export const useSendMfaToken = () => {
  return useMutation<{}, {}, SendMfaTokenDTO>({
    mutationFn: async ({ email }) => {
      const { data } = await apiRequest.post('/api/v2/auth/mfa/send', { email });
      return data;
    }
  });
}

export const useVerifyMfaToken = () => {
  return useMutation<VerifyMfaTokenRes, {}, VerifyMfaTokenDTO>({
    mutationFn: async ({ email, mfaCode }) => {
      const { data } = await apiRequest.post('/api/v2/auth/mfa/verify', {
        email,
        mfaToken: mfaCode
      });
      return data;
    }
  });
}

// Refresh token is set as cookie when logged in
// Using that we fetch the auth bearer token needed for auth calls
const fetchAuthToken = async () => {
//  const { data } = await apiRequest.post<GetAuthTokenAPI>('/api/v1/auth/token', undefined, {
  const { data } = await apiRequest.post<GetAuthTokenAPI>('/tapr/auth/token', undefined, {
      withCredentials: true
  });

  return data;
};

export const useGetAuthToken = () =>
  useQuery(authKeys.getAuthToken, fetchAuthToken, {
    onSuccess: (data) => setAuthToken(data.token),
    retry: 0
  });
