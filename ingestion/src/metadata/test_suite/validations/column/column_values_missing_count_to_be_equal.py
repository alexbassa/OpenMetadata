#  Copyright 2021 Collate
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  http://www.apache.org/licenses/LICENSE-2.0
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

"""
ColumnValuesMissingCount validation implementation
"""
from ast import literal_eval

# pylint: disable=duplicate-code
import traceback
from datetime import datetime

from sqlalchemy import inspect

from metadata.generated.schema.tests.basic import (
    TestCaseResult,
    TestCaseStatus,
    TestResultValue,
)
from metadata.generated.schema.tests.testCase import TestCase
from metadata.orm_profiler.metrics.core import add_props
from metadata.orm_profiler.metrics.registry import Metrics
from metadata.orm_profiler.profiler.runner import QueryRunner
from metadata.utils.logger import profiler_logger

logger = profiler_logger()


def column_values_missing_count_to_be_equal(
    test_case: TestCase,
    execution_date: datetime,
    runner: QueryRunner,
) -> TestCaseResult:
    """
    Validate Column Values metric
    :param test_case: ColumnValuesMissingCount. Just used to trigger singledispatch
    :param col_profile: should contain count and distinct count metrics
    :param execution_date: Datetime when the tests ran
    :param session: SQLAlchemy Session, for tests that need to compute new metrics
    :param table: SQLAlchemy Table, for tests that need to compute new metrics
    :param profile_sample: % of the data to run the profiler on
    :return: TestCaseResult with status and results
    """
    try:
        column_name = test_case.entityLink.__root__.split("::")[-1].replace(">", "")
        col = next(
            (col for col in inspect(runner.table).c if col.name == column_name),
            None,
        )
        if col is None:
            raise ValueError(
                f"Cannot find the configured column {column_name} for test case {test_case.name}"
            )

        null_count_value_dict = dict(
            runner.dispatch_query_select_first(Metrics.NULL_COUNT.value(col).fn())
        )
        null_count_value_res = null_count_value_dict.get(Metrics.NULL_COUNT.name)

    except Exception as err:
        msg = (
            f"Error computing {test_case.name} for {runner.table.__tablename__} - {err}"
        )
        logger.error(msg)
        return TestCaseResult(
            timestamp=execution_date,
            testCaseStatus=TestCaseStatus.Aborted,
            result=msg,
            testResultValue=[TestResultValue(name="nullCount", value=None)],
        )

    missing_values = next(
        (
            literal_eval(param.value)
            for param in test_case.parameterValues
            if param.name == "missingValueMatch"
        ),
        None,
    )
    missing_count_values = next(
        (
            literal_eval(param.value)
            for param in test_case.parameterValues
            if param.name == "missingCountValue"
        )
    )

    if missing_values:
        set_count = add_props(values=missing_values)(Metrics.COUNT_IN_SET.value)

        try:
            set_count_dict = dict(
                runner.dispatch_query_select_first(set_count(col).fn())
            )
            set_count_res = set_count_dict.get(Metrics.COUNT_IN_SET.name)

            # Add set count for special values into the missing count
            null_count_value_res += set_count_res

        except Exception as err:  # pylint: disable=broad-except
            msg = f"Error computing {test_case.__class__.__name__} for {runner.table.__tablename__} - {err}"
            logger.debug(traceback.format_exc())
            logger.warning(msg)
            return TestCaseResult(
                timestamp=execution_date,
                testCaseStatus=TestCaseStatus.Aborted,
                result=msg,
                testResultValue=[TestResultValue(name="nullCount", value=None)],
            )

    status = (
        TestCaseStatus.Success
        if null_count_value_res == missing_count_values
        else TestCaseStatus.Failed
    )
    result = f"Found missingCount={null_count_value_res}. It should be {missing_count_values}."

    return TestCaseResult(
        timestamp=execution_date,
        testCaseStatus=status,
        result=result,
        testResultValue=[
            TestResultValue(name="missingCount", value=str(null_count_value_res))
        ],
    )