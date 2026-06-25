import React from 'react';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { formatCurrency } from '../../../utils/resourcePlanning';

const OverviewItem = ({ label, value }) => (
  <div className="overview-item">
    <span className="overview-label">{label}</span>
    <span className="overview-value">{value || '-'}</span>
  </div>
);

const ProjectOverview = ({ project, basicInfo, deliveryDetails, technology, risks, financial, estimation }) => {
  const projectInfo = project || {};
  const client = basicInfo.client_name || projectInfo.business_unit || projectInfo.clientName || projectInfo.client_name;
  const industry = basicInfo.industry || projectInfo.industry;
  const industryCode = basicInfo.industry_code || projectInfo.industryCode;
  const deliveryModel = basicInfo.delivery_model || projectInfo.delivery_model || projectInfo.deliveryModel;
  const businessCriticality = basicInfo.business_criticality || projectInfo.business_criticality || projectInfo.businessCriticality;

  return (
    <div className="section-container">
      <div className="card-header">
        <strong>Project Overview</strong>
      </div>
      <div className="section-body">
        <div className="overview-grid">
          <OverviewItem label="Client" value={client} />
          <OverviewItem label="Industry" value={industry} />
          <OverviewItem label="Industry Code" value={industryCode} />
          <OverviewItem label="Delivery Model" value={deliveryModel} />
          <OverviewItem label="Start Date" value={formatDisplayDate(deliveryDetails.start_date)} />
          <OverviewItem label="Target Date" value={formatDisplayDate(deliveryDetails.planned_end_date)} />
          <OverviewItem label="PM Estimate (PD)" value={estimation.pmEstimatedValue || basicInfo.pm_estimated_value} />
          <OverviewItem label="AI Estimate (PD)" value={estimation.aiEstimatedValue} />
          <OverviewItem label="Complexity" value={technology.complexity} />
          <OverviewItem label="Architecture" value={technology.architecture_type} />
          <OverviewItem label="Cloud Platform" value={technology.cloud_platform} />
          <OverviewItem label="Billing Model" value={financial.billing_model} />
          <OverviewItem label="Business Criticality" value={businessCriticality} />
        </div>
      </div>
    </div>
  );
};

export default ProjectOverview;
