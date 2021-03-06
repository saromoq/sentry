import PropTypes from 'prop-types';
import React from 'react';
import {browserHistory} from 'react-router';

import {addErrorMessage, clearIndicators} from 'app/actionCreators/indicator';
import {t} from 'app/locale';
import HeaderSeparator from 'app/components/organizations/headerSeparator';
import MultipleProjectSelector from 'app/components/organizations/multipleProjectSelector';
import SentryTypes from 'app/sentryTypes';
import TimeRangeSelector from 'app/components/organizations/timeRangeSelector';

import Result from './result';
import Intro from './intro';
import EarlyAdopterMessage from './earlyAdopterMessage';
import QueryEdit from './sidebar/queryEdit';
import SavedQueryList from './sidebar/savedQueryList';

import {getQueryStringFromQuery, getQueryFromQueryString} from './utils';
import {isValidCondition} from './conditions/utils';
import {isValidAggregation} from './aggregations/utils';
import {
  Discover,
  Body,
  BodyContent,
  TopBar,
  Sidebar,
  SidebarTabs,
  PageTitle,
} from './styles';

import {trackQuery} from './analytics';

export default class OrganizationDiscover extends React.Component {
  static propTypes = {
    organization: SentryTypes.Organization,
    queryBuilder: PropTypes.object,
  };

  constructor() {
    super();
    this.state = {
      data: null,
      query: null,
      chartData: null,
      chartQuery: null,
      isFetchingQuery: false,
      view: 'query',
    };
  }

  componentWillReceiveProps(nextProps) {
    const {queryBuilder, location: {search}} = nextProps;
    const currentSearch = this.props.location.search;

    if (currentSearch === search) {
      return;
    }

    // Clear data only if location.search is empty (reset has been called)
    if (!search) {
      const newQuery = getQueryFromQueryString(search);
      queryBuilder.reset(newQuery);

      this.setState({
        data: null,
        query: null,
        chartData: null,
        chartQuery: null,
      });
    }
  }

  updateField = (field, value) => {
    this.props.queryBuilder.updateField(field, value);
    this.forceUpdate();
  };

  updateFields = query => {
    Object.entries(query).forEach(([field, value]) => {
      this.updateField(field, value);
    });
  };

  handleUpdateTime = ({relative, start, end}) => {
    this.updateFields({
      range: relative,
      start,
      end,
    });
  };

  runQuery = () => {
    const {queryBuilder, organization} = this.props;

    // Track query for analytics
    trackQuery(organization, queryBuilder.getExternal());

    // Strip any invalid conditions and aggregations
    const {conditions, aggregations} = queryBuilder.getInternal();
    const filteredConditions = conditions.filter(condition =>
      isValidCondition(condition, queryBuilder.getColumns())
    );

    const filteredAggregations = aggregations.filter(aggregation =>
      isValidAggregation(aggregation, queryBuilder.getColumns())
    );

    if (filteredConditions.length !== conditions.length) {
      this.updateField('conditions', filteredConditions);
    }

    if (filteredAggregations.length !== aggregations.length) {
      this.updateField('aggregations', filteredAggregations);
    }

    this.setState({isFetchingQuery: true});

    clearIndicators();

    const externalQuery = queryBuilder.getExternal();
    const baseQuery = queryBuilder.getQueryByType(externalQuery, 'baseQuery');

    queryBuilder.fetch(baseQuery).then(
      data => {
        const query = queryBuilder.getInternal();
        const queryCopy = {...query};
        this.setState({data, query: queryCopy, isFetchingQuery: false});

        browserHistory.push({
          pathname: `/organizations/${organization.slug}/discover/`,
          search: getQueryStringFromQuery(query),
        });
      },
      err => {
        addErrorMessage(err.message);
        this.setState({data: null, query: null, isFetchingQuery: false});
      }
    );

    // If there are aggregations, get data for chart
    if (externalQuery.aggregations.length > 0) {
      const chartQuery = queryBuilder.getQueryByType(externalQuery, 'byDayQuery');

      queryBuilder.fetch(chartQuery).then(
        chartData => {
          this.setState({chartData, chartQuery});
        },
        () => {
          this.setState({chartData: null, chartQuery: null});
        }
      );
    } else {
      this.setState({chartData: null, chartQuery: null});
    }
  };

  renderSidebarNav() {
    const {view} = this.state;
    const views = [
      {id: 'query', title: t('Query')},
      // {id: 'saved', title: t('Saved queries')},
    ];

    return (
      <SidebarTabs underlined={true}>
        {views.map(({id, title}) => (
          <li key={id} className={view === id ? 'active' : ''}>
            <a onClick={() => this.setState({view: id})}>{title}</a>
          </li>
        ))}
      </SidebarTabs>
    );
  }

  reset = () => {
    browserHistory.push({
      pathname: `/organizations/${this.props.organization.slug}/discover/`,
    });
  };

  render() {
    const {data, query, chartData, chartQuery, isFetchingQuery, view} = this.state;
    const {queryBuilder, organization} = this.props;

    const currentQuery = queryBuilder.getInternal();

    return (
      <Discover>
        <Sidebar>
          <PageTitle>{t('Discover')}</PageTitle>
          {this.renderSidebarNav()}
          {view === 'query' && (
            <QueryEdit
              queryBuilder={queryBuilder}
              isFetchingQuery={isFetchingQuery}
              onUpdateField={this.updateField}
              onRunQuery={this.runQuery}
              reset={this.reset}
            />
          )}
          {view === 'saved' && <SavedQueryList organization={organization} />}
        </Sidebar>
        <Body direction="column" flex="1">
          <TopBar>
            <MultipleProjectSelector
              value={currentQuery.projects}
              projects={organization.projects}
              onChange={val => this.updateField('projects', val)}
              onUpdate={this.runQuery}
            />
            <HeaderSeparator />
            <TimeRangeSelector
              showAbsolute={true}
              showRelative={true}
              start={currentQuery.start}
              end={currentQuery.end}
              relative={currentQuery.range}
              onChange={this.handleUpdateTime}
              onUpdate={this.runQuery}
            />
          </TopBar>
          <BodyContent>
            {data && (
              <Result
                flex="1"
                data={data}
                query={query}
                chartData={chartData}
                chartQuery={chartQuery}
              />
            )}
            {!data && <Intro updateQuery={this.updateFields} />}
            <EarlyAdopterMessage />
          </BodyContent>
        </Body>
      </Discover>
    );
  }
}
