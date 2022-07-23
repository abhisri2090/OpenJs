/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
/* eslint-disable react-hooks/exhaustive-deps */
// TODO: fix all these any
import { useSnackbar } from '@c2fo/react-components';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useHistory } from 'react-router-dom';

import { RouteUrls, SIGN_OUT, SOMETHING_WRONG } from '../constants';
import { useServices } from '../services/Interceptor';
import { CustomAxios } from '../types/axios.schema';

interface ApiConfigs<R> {
  successMsg?: string;
  errorMsg?: string;
  callBack?: ({ isError, response }: { isError: boolean; response: R }) => void;
}
type defaultReturnType = Record<string | number, any>;
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;
type ReturnProps<T = undefined, R = defaultReturnType> = [
  callApi: (params?: T, configs?: ApiConfigs<R>) => void,
  loading: boolean,
  data: R | undefined,
  error: any,
  callAbort: CallableFunction | null,
];

/**
 * ## UseApiCall - is a custom hook, use this to make HTTP API calls
 * ----
 * ### Returns - [triggerApiCall, loadingState, successData, errorData, callAbort]
 * ----
 * @param apiCallService API call service function, that must be defined in service file
 * @param onSuccess optional callback, called on api success
 * @param onFail optional callback, called on api failure
 * @param skipRouter to skip router navigation (logout) on api failure (401)
 * // THIS SHOULD ONLY BE USED IN REACT COMPONENTS BEFORE ROUTER IS INITIALIZED
 * ---
 * Second param (configs) for the triggerApiCall
 * @param params - directly passed to api service function
 * @param configs - optional configs
 *  - successMsg - optional success message
 *  - errorMsg - optional error message
 *  - hideDefaultError - optional, if true, default error message will not be shown
 *  - callBack - optional, if true, callback will be called on success
 * ``` js
 * { isError: false, response: response.data } => void
 * ```
 */
function UseApiCall<T, R = Record<string, any>>(
  apiCallService: T extends (...args: any) => CustomAxios ? T : (...args: any) => any,
  onSuccess?: (data: Awaited<ReturnType<typeof apiCallService>['axiosCall']>['data']) => void,
  onFail?: (error: any) => void,
  skipRouter = false,
): ReturnProps<Parameters<typeof apiCallService>[0], Awaited<ReturnType<typeof apiCallService>['axiosCall']>['data']> {
  const [data, setData] = useState<Awaited<ReturnType<typeof apiCallService>['axiosCall']>['data'] | undefined>(
    undefined,
  );
  const { openSnackbar } = useSnackbar();
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { tokenService } = useServices();
  const callAbort = useRef<CallableFunction | null>(null);
  const isCallCancelledByComponent = useRef<boolean>(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const history = !skipRouter ? useHistory() : undefined;

  useEffect(() => {
    return () => {
      if (callAbort.current && loading) {
        callAbort.current();
        isCallCancelledByComponent.current = true;
      }
    };
  }, [loading]);

  /**
   * @param params - directly passed to api service function
   * @param configs - optional configs
   *  - successMsg - optional success message
   *  - errorMsg - optional error message
   *  - hideDefaultError - optional, if true, default error message will not be shown
   *  - callBack - optional, if true, callback will be called on success
   * */
  const callApi = (params?: Parameters<typeof apiCallService>[0], configs: ApiConfigs<R> = {}) => {
    if (loading && callAbort.current) {
      callAbort.current();
      isCallCancelledByComponent.current = true;
    }

    setLoading(true);
    const { axiosCall, abort } = apiCallService(params);
    callAbort.current = abort;
    axiosCall
      .then((response: any) => {
        if (configs.successMsg) openSnackbar(configs.successMsg, { variant: 'success' });
        setData(response.data);
        if (onSuccess) onSuccess(response.data);

        if (configs.callBack) configs.callBack({ isError: false, response: response.data });
      })
      .catch((err: any) => {
        if (isCallCancelledByComponent.current) return;

        console.warn('<<<<api Err:', err);

        if (configs.callBack) configs.callBack({ isError: true, response: err });

        let formatMessage;
        if (Number(err?.status) === 401) {
          onUnauthenticated();
        } else if (Number(err?.status) > 399) {
          if (!err?.options?.hideDefaultError)
            openSnackbar(configs.errorMsg || err.options?.errMsg || formatMessage || SOMETHING_WRONG, {
              variant: 'error',
            });
          setError(err);
          if (onFail) onFail(err);
        }
      })
      .finally(() => {
        if (isCallCancelledByComponent.current) {
          isCallCancelledByComponent.current = false;
          return;
        }
        callAbort.current = null;
        setLoading(false);
      });
  };

  const onUnauthenticated = useCallback(() => {
    if (skipRouter) return;
    openSnackbar(SIGN_OUT, { variant: 'info' });
    tokenService.clearToken();
    if (history) history.push(`${RouteUrls.Login}`);
  }, [history, skipRouter, tokenService]);

  return [callApi, loading, data, error, callAbort.current];
}

export default UseApiCall;