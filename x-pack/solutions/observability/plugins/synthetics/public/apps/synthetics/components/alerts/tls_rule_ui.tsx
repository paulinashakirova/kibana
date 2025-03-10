/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useDispatch, useSelector } from 'react-redux';
import React, { useEffect } from 'react';
import { RuleTypeParamsExpressionProps } from '@kbn/triggers-actions-ui-plugin/public';
import type { TLSRuleParams } from '@kbn/response-ops-rule-params/synthetics_tls';
import { AlertTlsComponent } from './alert_tls';
import { getDynamicSettingsAction, selectDynamicSettings } from '../../state/settings';
import { DYNAMIC_SETTINGS_DEFAULTS } from '../../../../../common/constants';

export const TLSRuleComponent: React.FC<{
  ruleParams: RuleTypeParamsExpressionProps<TLSRuleParams>['ruleParams'];
  setRuleParams: RuleTypeParamsExpressionProps<TLSRuleParams>['setRuleParams'];
}> = ({ ruleParams, setRuleParams }) => {
  const dispatch = useDispatch();

  const { settings } = useSelector(selectDynamicSettings);

  useEffect(() => {
    if (typeof settings === 'undefined') {
      dispatch(getDynamicSettingsAction.get());
    }
  }, [dispatch, settings]);

  return (
    <AlertTlsComponent
      ageThreshold={
        ruleParams.certAgeThreshold ??
        settings?.certAgeThreshold ??
        DYNAMIC_SETTINGS_DEFAULTS.certAgeThreshold
      }
      expirationThreshold={
        ruleParams.certExpirationThreshold ??
        settings?.certExpirationThreshold ??
        DYNAMIC_SETTINGS_DEFAULTS.certExpirationThreshold
      }
      setAgeThreshold={(value) => setRuleParams('certAgeThreshold', Number(value))}
      setExpirationThreshold={(value) => setRuleParams('certExpirationThreshold', Number(value))}
    />
  );
};
