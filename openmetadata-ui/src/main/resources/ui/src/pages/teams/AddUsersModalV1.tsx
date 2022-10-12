/*
 *  Copyright 2021 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { List, Modal } from 'antd';
import { AxiosError } from 'axios';
import { isUndefined } from 'lodash';
import { SearchResponse } from 'Models';
import VirtualList from 'rc-virtual-list';
import React, { useEffect, useState } from 'react';
import { searchData } from '../../axiosAPIs/miscAPI';
import { getUsers } from '../../axiosAPIs/userAPI';
import Searchbar from '../../components/common/searchbar/Searchbar';
import { PAGE_SIZE_MEDIUM, pagingObject } from '../../constants/constants';
import { INITIAL_FROM } from '../../constants/explore.constants';
import { SearchIndex } from '../../enums/search.enum';
import { OwnerType } from '../../enums/user.enum';
import {
  EntityReference as UserTeams,
  User,
} from '../../generated/entity/teams/user';
import { Paging } from '../../generated/type/paging';
import jsonData from '../../jsons/en';
import { formatUsersResponse } from '../../utils/APIUtils';
import { getEntityName } from '../../utils/CommonUtils';
import { showErrorToast } from '../../utils/ToastUtils';
import './AddUsersModal.less';
import UserCard from './UserCard';

type Props = {
  isVisible: boolean;
  searchPlaceHolder?: string;
  header: string;
  list: Array<UserTeams>;
  onCancel: () => void;
  onSave: (data: Array<UserTeams>) => void;
};
const ContainerHeight = 250;
const AddUsersModalV1 = ({
  isVisible,
  header,
  list,
  onCancel,
  onSave,
  searchPlaceHolder,
}: Props) => {
  const [uniqueUser, setUniqueUser] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Array<string>>([]);
  const [searchText, setSearchText] = useState('');
  const [userPaging, setUserPaging] = useState<Paging>(pagingObject);
  const [currentPage, setCurrentPage] = useState(INITIAL_FROM);
  const [totalESCount, setTotalESCount] = useState(0);

  const searchUsers = (text: string, page: number) => {
    searchData(text, page, PAGE_SIZE_MEDIUM, '', '', '', SearchIndex.USER)
      .then((res: SearchResponse) => {
        const data = formatUsersResponse(res.data.hits.hits);
        setTotalESCount(res.data.hits.total.value);
        setCurrentPage((pre) => pre + 1);
        setUniqueUser((pre) => [...pre, ...data]);
      })
      .catch(() => {
        setUniqueUser([]);
      });
  };

  const fetchAllUsers = async (after?: string) => {
    const param = after
      ? {
          after,
        }
      : undefined;
    try {
      const { data, paging } = await getUsers('', PAGE_SIZE_MEDIUM, param);

      setUniqueUser((pre) => [...pre, ...data]);
      setUserPaging(paging);
    } catch (error) {
      setUniqueUser([]);
      showErrorToast(
        error as AxiosError,
        jsonData['api-error-messages']['fetch-users-error']
      );
    }
  };

  const selectionHandler = (id: string) => {
    setSelectedUsers((prevState) => {
      if (prevState.includes(id)) {
        const userArr = [...prevState];
        const index = userArr.indexOf(id);
        userArr.splice(index, 1);

        return userArr;
      } else {
        return [...prevState, id];
      }
    });
  };
  const getUserCards = () => {
    return uniqueUser
      .filter((user) => {
        const teamUser = list.some((teamUser) => user.id === teamUser.id);

        return !teamUser && user;
      })
      .map((user) => {
        return {
          displayName: getEntityName(user),
          fqn: user.fullyQualifiedName || '',
          id: user.id,
          type: OwnerType.USER,
          name: user.name,
        };
      });
  };

  const handleSave = () => {
    onSave(
      selectedUsers.map((id) => {
        return {
          id,
          type: OwnerType.USER,
        };
      })
    );
  };

  const handleSearchAction = (searchValue: string) => {
    setUniqueUser([]);
    setCurrentPage(INITIAL_FROM);
    setSearchText(searchValue);
    if (searchValue) {
      searchUsers(searchValue, currentPage);
    } else {
      fetchAllUsers();
    }
  };
  const onScroll = (e: React.UIEvent<HTMLElement, UIEvent>) => {
    if (
      e.currentTarget.scrollHeight - e.currentTarget.scrollTop ===
      ContainerHeight
    ) {
      if (searchText) {
        // make API call only when current page size is less then total count
        PAGE_SIZE_MEDIUM * currentPage < totalESCount &&
          searchUsers(searchText, currentPage);
      } else {
        !isUndefined(userPaging.after) && fetchAllUsers(userPaging.after);
      }
    }
  };

  useEffect(() => {
    fetchAllUsers();
  }, []);

  return (
    <Modal
      data-testid="modal-container"
      okText="Save"
      title={header}
      visible={isVisible}
      width={750}
      onCancel={onCancel}
      onOk={handleSave}>
      <Searchbar
        placeholder={
          searchPlaceHolder ? searchPlaceHolder : 'Search for a user...'
        }
        searchValue={searchText}
        typingInterval={500}
        onSearch={handleSearchAction}
      />

      <List>
        <VirtualList
          className="user-list"
          data={getUserCards()}
          height={ContainerHeight}
          itemKey="user"
          onScroll={onScroll}>
          {(User) => (
            <UserCard
              isActionVisible
              isCheckBoxes
              isIconVisible
              item={User}
              key={User.id}
              onSelect={selectionHandler}
            />
          )}
        </VirtualList>
      </List>
    </Modal>
  );
};

export default AddUsersModalV1;
